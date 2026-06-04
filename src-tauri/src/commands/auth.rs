//! Команды авторизации для защищённых режимов приложения
//!
//! Режим редактирования открывается только паролем владельца, который
//! вшивается в бинарник на этапе сборки. Пользователь приложения не может
//! создать, заменить или сбросить этот пароль через интерфейс.

use sha2::{Digest, Sha256};

include!(concat!(env!("OUT_DIR"), "/edit_mode_secret.rs"));

fn bytes_to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for &byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

fn hash_password(password: &str, salt: &str, iterations: u32) -> String {
    let iterations = iterations.max(1);

    let mut hasher = Sha256::new();
    hasher.update(salt.as_bytes());
    hasher.update(password.as_bytes());
    let mut digest = hasher.finalize().to_vec();

    for _ in 1..iterations {
        let mut round = Sha256::new();
        round.update(salt.as_bytes());
        round.update(&digest);
        round.update(password.as_bytes());
        digest = round.finalize().to_vec();
    }

    bytes_to_hex(&digest)
}

fn constant_time_eq(a: &str, b: &str) -> bool {
    let a_bytes = a.as_bytes();
    let b_bytes = b.as_bytes();
    let max_len = a_bytes.len().max(b_bytes.len());
    let mut diff = a_bytes.len() ^ b_bytes.len();

    for idx in 0..max_len {
        let left = a_bytes.get(idx).copied().unwrap_or(0);
        let right = b_bytes.get(idx).copied().unwrap_or(0);
        diff |= (left ^ right) as usize;
    }

    diff == 0
}

fn is_edit_mode_password_embedded() -> bool {
    !EDIT_MODE_PASSWORD_SALT.is_empty() && !EDIT_MODE_PASSWORD_HASH.is_empty()
}

/// Проверяет, есть ли в текущем билде вшитый пароль владельца.
#[tauri::command]
pub fn get_edit_mode_password_status() -> Result<bool, String> {
    Ok(is_edit_mode_password_embedded())
}

/// Проверяет пароль владельца для режима редактирования.
#[tauri::command]
pub fn verify_edit_mode_password(password: String) -> Result<bool, String> {
    if !is_edit_mode_password_embedded() {
        return Err("Пароль режима редактирования не вшит в этот билд".to_string());
    }

    let candidate = hash_password(
        &password,
        EDIT_MODE_PASSWORD_SALT,
        EDIT_MODE_HASH_ITERATIONS,
    );

    Ok(constant_time_eq(&candidate, EDIT_MODE_PASSWORD_HASH))
}
