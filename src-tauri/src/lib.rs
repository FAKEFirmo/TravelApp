// Local storage for the app: one JSON library file plus a photos folder in the app data directory.
use std::{fs, io::Write, path::PathBuf};
use tauri::{
    ipc::{InvokeBody, Request},
    AppHandle, Manager,
};

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(dir.join("photos")).map_err(|e| e.to_string())?;
    Ok(dir)
}

/// Photo names come from the frontend: allow plain file names only, never paths.
fn valid_name(name: &str) -> bool {
    !name.is_empty() && !name.starts_with('.') && name.chars().all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
}

fn photo_path(app: &AppHandle, name: &str) -> Result<PathBuf, String> {
    if !valid_name(name) {
        return Err(format!("invalid photo name: {name}"));
    }
    Ok(data_dir(app)?.join("photos").join(name))
}

#[tauri::command]
fn load_library(app: AppHandle) -> Result<String, String> {
    match fs::read_to_string(data_dir(&app)?.join("library.json")) {
        Ok(text) => Ok(text),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Atomic save: write + fsync a temp file, keep the previous version as library.bak.json, then rename over.
#[tauri::command]
fn save_library(app: AppHandle, json: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let (file, tmp) = (dir.join("library.json"), dir.join("library.json.tmp"));
    let mut f = fs::File::create(&tmp).map_err(|e| e.to_string())?;
    f.write_all(json.as_bytes()).and_then(|_| f.sync_all()).map_err(|e| e.to_string())?;
    if file.exists() {
        fs::copy(&file, dir.join("library.bak.json")).map_err(|e| e.to_string())?;
    }
    fs::rename(&tmp, &file).map_err(|e| e.to_string())
}

/// Raw image bytes in the body, file name in the `name` header.
#[tauri::command]
fn save_photo(app: AppHandle, request: Request) -> Result<(), String> {
    let InvokeBody::Raw(bytes) = request.body() else {
        return Err("expected raw image bytes".into());
    };
    let name = request.headers().get("name").and_then(|v| v.to_str().ok()).ok_or("missing name")?;
    fs::write(photo_path(&app, name)?, bytes).map_err(|e| e.to_string())
}

#[tauri::command]
fn delete_photo(app: AppHandle, name: String) -> Result<(), String> {
    match fs::remove_file(photo_path(&app, &name)?) {
        Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
        _ => Ok(()),
    }
}

#[tauri::command]
fn photos_dir(app: AppHandle) -> Result<String, String> {
    Ok(data_dir(&app)?.join("photos").to_string_lossy().into_owned())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![load_library, save_library, save_photo, delete_photo, photos_dir])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::valid_name;

    #[test]
    fn photo_names_cannot_escape_the_folder() {
        assert!(valid_name("3f2a-91.jpg"));
        assert!(valid_name("3f2a-91.thumb.jpg"));
        for bad in ["", ".hidden", "../library.json", "a/b.jpg", "a\\b.jpg", "~.jpg"] {
            assert!(!valid_name(bad), "{bad}");
        }
    }
}
