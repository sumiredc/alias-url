use std::{env, net::SocketAddr, time::Duration};

use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderValue, Method, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::{Deserialize, Serialize};
use serde_json::json;
use sqlx::{
    MySqlPool, Row,
    mysql::{MySqlConnectOptions, MySqlPoolOptions, MySqlSslMode},
};
use tower_http::{cors::CorsLayer, trace::TraceLayer};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};
use url::Url;

#[derive(Clone)]
struct AppState {
    pool: MySqlPool,
    app_url: String,
}

#[derive(Clone)]
struct Config {
    app_url: String,
    cors_allow_origin: String,
    database_url: String,
    db_ssl_mode: MySqlSslMode,
    max_connections: u32,
    min_connections: u32,
}

#[derive(Deserialize)]
struct CreateAliasRequest {
    url: String,
    alias: String,
}

#[derive(Serialize)]
struct CreateAliasResponse {
    alias: String,
    url: String,
    #[serde(rename = "shortUrl")]
    short_url: String,
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::registry()
        .with(
            tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into()),
        )
        .with(tracing_subscriber::fmt::layer())
        .init();

    let config = Config::from_env();
    let connect_options = config
        .database_url
        .parse::<MySqlConnectOptions>()?
        .ssl_mode(config.db_ssl_mode);
    let pool = MySqlPoolOptions::new()
        .max_connections(config.max_connections)
        .min_connections(config.min_connections)
        .acquire_timeout(Duration::from_secs(3))
        .connect_with(connect_options)
        .await?;

    let state = AppState {
        pool,
        app_url: config.app_url,
    };

    let app = Router::new()
        .route("/health", get(health))
        .route("/api/aliases", post(create_alias))
        .route("/:alias", get(redirect_alias))
        .with_state(state)
        .layer(cors_layer(&config.cors_allow_origin))
        .layer(TraceLayer::new_for_http());

    let listener = tokio::net::TcpListener::bind(SocketAddr::from(([0, 0, 0, 0], 80))).await?;
    tracing::info!("listening on {}", listener.local_addr()?);

    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    Ok(())
}

impl Config {
    fn from_env() -> Self {
        let host = env_value("DB_HOST", "mysql");
        let port = env_value("DB_PORT", "3306");
        let database = env_value("DB_DATABASE", "alias_url");
        let username = env_value("DB_USERNAME", "user");
        let password = env_value("DB_PASSWORD", "password");

        let max_connections = env_value("DB_MAX_CONNECTIONS", "64").parse().unwrap_or(64);
        let min_connections = env_value("DB_MIN_CONNECTIONS", "0")
            .parse::<u32>()
            .unwrap_or(0)
            .min(max_connections);

        Self {
            app_url: trim_trailing_slash(&env_value("APP_URL", "http://localhost:8080")),
            cors_allow_origin: env_value("CORS_ALLOW_ORIGIN", "http://localhost:5173"),
            database_url: format!("mysql://{username}:{password}@{host}:{port}/{database}"),
            db_ssl_mode: parse_db_ssl_mode(&env_value("DB_SSL_MODE", "required")),
            max_connections,
            min_connections,
        }
    }
}

fn parse_db_ssl_mode(value: &str) -> MySqlSslMode {
    match value.trim().to_ascii_lowercase().as_str() {
        "preferred" => MySqlSslMode::Preferred,
        "required" => MySqlSslMode::Required,
        "verify_ca" | "verify-ca" => MySqlSslMode::VerifyCa,
        "verify_identity" | "verify-identity" => MySqlSslMode::VerifyIdentity,
        invalid => panic!(
            "invalid DB_SSL_MODE `{invalid}`; expected preferred|required|verify_ca|verify_identity"
        ),
    }
}

async fn health(State(state): State<AppState>) -> Result<Json<serde_json::Value>, AppError> {
    sqlx::query("SELECT 1").execute(&state.pool).await?;

    Ok(Json(json!({ "status": "ok" })))
}

async fn create_alias(
    State(state): State<AppState>,
    Json(payload): Json<CreateAliasRequest>,
) -> Result<(StatusCode, Json<CreateAliasResponse>), AppError> {
    let url = payload.url.trim().to_owned();
    let alias = payload.alias.trim().to_owned();

    validate_create_alias(&url, &alias)?;

    let exists = sqlx::query("SELECT id FROM aliases WHERE alias = ? LIMIT 1")
        .bind(&alias)
        .fetch_optional(&state.pool)
        .await?
        .is_some();

    if exists {
        return Err(AppError::Conflict(
            "This short name is already used.".to_owned(),
        ));
    }

    let result = sqlx::query("INSERT INTO aliases (alias, url) VALUES (?, ?)")
        .bind(&alias)
        .bind(&url)
        .execute(&state.pool)
        .await;

    match result {
        Ok(_) => Ok((
            StatusCode::CREATED,
            Json(CreateAliasResponse {
                short_url: format!("{}/{}", state.app_url, alias),
                alias,
                url,
            }),
        )),
        Err(error) if is_duplicate_alias(&error) => Err(AppError::Conflict(
            "This short name is already used.".to_owned(),
        )),
        Err(error) => Err(AppError::Sqlx(error)),
    }
}

async fn redirect_alias(
    State(state): State<AppState>,
    Path(alias): Path<String>,
) -> Result<Response, AppError> {
    if !is_valid_alias_format(&alias) {
        return Err(AppError::NotFound("Alias was not found.".to_owned()));
    }

    let row = sqlx::query("SELECT url FROM aliases WHERE alias = ? LIMIT 1")
        .bind(alias)
        .fetch_optional(&state.pool)
        .await?;

    let Some(row) = row else {
        return Err(AppError::NotFound("Alias was not found.".to_owned()));
    };

    let url: String = row.try_get("url")?;

    Ok((StatusCode::FOUND, [(header::LOCATION, url)]).into_response())
}

fn validate_create_alias(url: &str, alias: &str) -> Result<(), AppError> {
    let mut errors = serde_json::Map::new();

    if url.is_empty() {
        push_error(&mut errors, "url", "URL is required.");
    } else if !is_http_url(url) {
        push_error(&mut errors, "url", "URL must be a valid http or https URL.");
    }

    if alias.is_empty() {
        push_error(&mut errors, "alias", "Short name is required.");
    } else {
        if alias.len() > 255 {
            push_error(
                &mut errors,
                "alias",
                "Short name must be 255 characters or less.",
            );
        }

        if !is_valid_alias_format(alias) {
            push_error(
                &mut errors,
                "alias",
                "Short name can only contain letters, numbers, underscores, and hyphens.",
            );
        }

        if matches!(alias.to_ascii_lowercase().as_str(), "api" | "health") {
            push_error(&mut errors, "alias", "This short name is reserved.");
        }
    }

    if errors.is_empty() {
        Ok(())
    } else {
        Err(AppError::Validation(errors))
    }
}

fn push_error(errors: &mut serde_json::Map<String, serde_json::Value>, field: &str, message: &str) {
    errors
        .entry(field.to_owned())
        .or_insert_with(|| serde_json::Value::Array(Vec::new()))
        .as_array_mut()
        .expect("validation error field must be an array")
        .push(serde_json::Value::String(message.to_owned()));
}

fn is_http_url(value: &str) -> bool {
    Url::parse(value)
        .map(|url| matches!(url.scheme(), "http" | "https") && url.host_str().is_some())
        .unwrap_or(false)
}

fn is_valid_alias_format(value: &str) -> bool {
    value
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_' || byte == b'-')
}

fn is_duplicate_alias(error: &sqlx::Error) -> bool {
    match error {
        sqlx::Error::Database(database_error) => database_error.code().as_deref() == Some("23000"),
        _ => false,
    }
}

fn cors_layer(origin: &str) -> CorsLayer {
    let origin = origin
        .parse::<HeaderValue>()
        .unwrap_or_else(|_| HeaderValue::from_static("http://localhost:5173"));

    CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([Method::GET, Method::POST, Method::OPTIONS])
        .allow_headers([header::CONTENT_TYPE])
}

fn env_value(key: &str, default: &str) -> String {
    env::var(key).unwrap_or_else(|_| default.to_owned())
}

fn trim_trailing_slash(value: &str) -> String {
    value.trim_end_matches('/').to_owned()
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

enum AppError {
    Validation(serde_json::Map<String, serde_json::Value>),
    Conflict(String),
    NotFound(String),
    Sqlx(sqlx::Error),
}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        Self::Sqlx(error)
    }
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        match self {
            AppError::Validation(errors) => (
                StatusCode::BAD_REQUEST,
                Json(json!({
                    "message": "Validation failed.",
                    "errors": errors,
                })),
            )
                .into_response(),
            AppError::Conflict(message) => {
                (StatusCode::CONFLICT, Json(json!({ "message": message }))).into_response()
            }
            AppError::NotFound(message) => (
                StatusCode::NOT_FOUND,
                [(header::CONTENT_TYPE, "text/plain")],
                message,
            )
                .into_response(),
            AppError::Sqlx(error) => {
                tracing::error!(%error, "database error");

                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(json!({ "message": "Internal server error." })),
                )
                    .into_response()
            }
        }
    }
}
