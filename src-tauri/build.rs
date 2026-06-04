use std::{env, fs, path::Path};

use sha2::{Digest, Sha256};

const EDIT_MODE_HASH_ITERATIONS: u32 = 120_000;
const EDIT_MODE_PASSWORD_MIN_LEN: usize = 6;

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

fn generate_build_salt(password: &str) -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or_default();

    let mut hasher = Sha256::new();
    hasher.update(b"ai-prompts-manager-edit-mode");
    let package_version = env::var("CARGO_PKG_VERSION").unwrap_or_default();
    hasher.update(package_version.as_bytes());
    hasher.update(now.to_le_bytes());
    hasher.update(password.as_bytes());
    bytes_to_hex(&hasher.finalize())
}

fn write_secret_file(salt: &str, hash: &str) {
    let out_dir = env::var("OUT_DIR").expect("OUT_DIR is not set");
    let dest = Path::new(&out_dir).join("edit_mode_secret.rs");

    fs::write(
        dest,
        format!(
            "pub const EDIT_MODE_PASSWORD_SALT: &str = {salt:?};\n\
             pub const EDIT_MODE_PASSWORD_HASH: &str = {hash:?};\n\
             pub const EDIT_MODE_HASH_ITERATIONS: u32 = {iterations};\n",
            salt = salt,
            hash = hash,
            iterations = EDIT_MODE_HASH_ITERATIONS,
        ),
    )
    .expect("failed to write edit_mode_secret.rs");
}

fn main() {
    println!("cargo:rerun-if-env-changed=APM_EDIT_MODE_PASSWORD");
    println!("cargo:rerun-if-env-changed=APM_EDIT_MODE_PASSWORD_SALT");
    println!("cargo:rerun-if-env-changed=APM_EDIT_MODE_PASSWORD_HASH");

    let password = env::var("APM_EDIT_MODE_PASSWORD").ok().filter(|v| !v.is_empty());
    let salt_env = env::var("APM_EDIT_MODE_PASSWORD_SALT").ok().filter(|v| !v.is_empty());
    let hash_env = env::var("APM_EDIT_MODE_PASSWORD_HASH").ok().filter(|v| !v.is_empty());

    match (password, salt_env, hash_env) {
        (Some(password), None, None) => {
            if password.chars().count() < EDIT_MODE_PASSWORD_MIN_LEN {
                panic!(
                    "APM_EDIT_MODE_PASSWORD must contain at least {} characters",
                    EDIT_MODE_PASSWORD_MIN_LEN
                );
            }

            let salt = generate_build_salt(&password);
            let hash = hash_password(&password, &salt, EDIT_MODE_HASH_ITERATIONS);
            write_secret_file(&salt, &hash);
        }
        (None, Some(salt), Some(hash)) => {
            write_secret_file(&salt, &hash);
        }
        (None, None, None) => {
            // No owner password was provided for this build. Edit mode remains locked.
            write_secret_file("", "");
        }
        _ => {
            panic!(
                "Set either APM_EDIT_MODE_PASSWORD, or both APM_EDIT_MODE_PASSWORD_SALT and APM_EDIT_MODE_PASSWORD_HASH"
            );
        }
    }

    tauri_build::build();
}
