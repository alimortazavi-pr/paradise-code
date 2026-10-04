#[cfg(target_os = "macos")]
use std::os::unix::fs::symlink;
use std::{
    fs,
    path::{Path, PathBuf},
};

#[cfg(target_os = "macos")]
const PARENTS: [&str; 3] = [
    "Library/WebKit",
    "Library/Caches",
    "Library/Application Support",
];

pub fn home() -> Result<PathBuf, Box<dyn std::error::Error>> {
    Ok(PathBuf::from(
        std::env::var_os(if cfg!(windows) { "USERPROFILE" } else { "HOME" })
            .ok_or("Home directory is unavailable")?,
    ))
}
pub fn pointer(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Preferences/dev.paradise.code.storage.json")
    } else {
        default_profile(home).join("storage.json")
    }
}
pub fn default_profile(home: &Path) -> PathBuf {
    if cfg!(target_os = "macos") {
        home.join("Library/Application Support/ParadiseCodeData")
    } else if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .map(PathBuf::from)
            .unwrap_or_else(|| home.join("AppData/Local"))
            .join("ParadiseCodeData")
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| home.join(".local/share"))
            .join("ParadiseCodeData")
    }
}
pub fn saved_profile(home: &Path) -> Result<Option<PathBuf>, Box<dyn std::error::Error>> {
    let pointer = pointer(home);
    if pointer.exists() {
        Ok(Some(serde_json::from_slice(&fs::read(pointer)?)?))
    } else {
        #[cfg(target_os = "macos")]
        return Ok(fs::read_link(home.join("Library/WebKit/dev.paradise.code"))
            .ok()
            .and_then(|p| p.parent().map(Path::to_path_buf)));
        #[cfg(not(target_os = "macos"))]
        Ok(None)
    }
}

// Change only our own links, never the data behind them. The previous pointer is
// retained as a recovery record; a disconnected drive is never silently replaced.
pub fn select_profile(home: &Path, profile: &Path) -> Result<(), Box<dyn std::error::Error>> {
    if !profile.is_absolute() || !profile.is_dir() {
        return Err("Choose an existing, writable folder for Paradise Code data.".into());
    }
    let previous = saved_profile(home)?;
    let mut roots = vec![profile.to_path_buf()];
    if let Some(old) = previous
        .as_ref()
        .filter(|old| old.is_dir() && old.as_path() != profile)
    {
        roots.push(old.clone());
    }
    let mut locks = Vec::new();
    for root in roots {
        let lock = crate::private_options()
            .read(true)
            .write(true)
            .create(true)
            .truncate(false)
            .open(root.join("app.lock"))?;
        if lock.try_lock().is_err() {
            return Err("Close other Paradise Code windows using this storage before selecting a different folder.".into());
        }
        locks.push(lock);
    }
    let mut changes: Vec<(PathBuf, PathBuf)> = Vec::new();
    #[cfg(target_os = "macos")]
    for parent in PARENTS {
        let link = home.join(parent).join("dev.paradise.code");
        let suffix = parent.replace('/', "-");
        let target = profile.join(&suffix);
        if let Ok(meta) = fs::symlink_metadata(&link) {
            if !meta.file_type().is_symlink() {
                return Err(format!("Existing data at {} was preserved. Choose the original storage folder instead.", link.display()).into());
            }
            let old = fs::read_link(&link)?;
            if old != target && previous.as_ref().map(|p| p.join(&suffix)).as_ref() != Some(&old) {
                return Err("An unrecognized storage link was preserved. Restore the original storage folder before continuing.".into());
            }
            if old == target {
                continue;
            }
        }
        fs::create_dir_all(&target)?;
        fs::create_dir_all(link.parent().unwrap())?;
        changes.push((link, target));
    }
    // Validate write access before touching the old profile selection.
    let probe = profile.join(format!(".paradise-write-check-{}", std::process::id()));
    let _probe = super::private_options()
        .write(true)
        .create_new(true)
        .open(&probe)?;
    fs::remove_file(&probe)?;
    let pointer = pointer(home);
    fs::create_dir_all(pointer.parent().unwrap())?;
    if pointer.exists() {
        fs::copy(&pointer, pointer.with_extension("json.previous"))?;
    }
    let temporary_pointer = pointer.with_extension("json.new");
    super::write_private(&temporary_pointer, &serde_json::to_vec(profile)?)?;
    let mut replaced: Vec<(PathBuf, Option<PathBuf>)> = Vec::new();
    let result = (|| -> std::io::Result<()> {
        #[cfg(target_os = "macos")]
        for (link, target) in &changes {
            let old = fs::read_link(link).ok();
            let temporary = link.with_extension(format!("switch-{}", rand::random::<u64>()));
            symlink(target, &temporary)?;
            if let Err(error) = fs::rename(&temporary, link) {
                let _ = fs::remove_file(temporary);
                return Err(error);
            }
            replaced.push((link.clone(), old));
        }
        fs::rename(&temporary_pointer, &pointer)
    })();
    if let Err(error) = result {
        let mut rollback_failed = false;
        #[cfg(target_os = "macos")]
        for (link, old) in replaced.iter().rev() {
            let restored = if let Some(old) = old {
                let temporary = link.with_extension(format!("restore-{}", rand::random::<u64>()));
                symlink(old, &temporary).and_then(|_| fs::rename(temporary, link))
            } else {
                fs::remove_file(link)
            };
            rollback_failed |= restored.is_err();
        }
        let _ = fs::remove_file(temporary_pointer);
        if rollback_failed {
            return Err(format!("Storage could not be selected ({error}). Previous data is intact; storage links need repair before reopening.").into());
        }
        return Err(error.into());
    }
    Ok(())
}

#[cfg(all(test, target_os = "macos"))]
mod tests {
    use super::*;
    fn fixture() -> PathBuf {
        let root = std::env::temp_dir().join(format!(
            "paradise-storage-{}-{}",
            std::process::id(),
            rand::random::<u64>()
        ));
        fs::create_dir_all(&root).unwrap();
        root
    }
    #[test]
    fn fresh_install_has_no_external_dependency() {
        let home = fixture();
        assert!(saved_profile(&home).unwrap().is_none());
        assert_eq!(
            default_profile(&home),
            home.join("Library/Application Support/ParadiseCodeData")
        );
        fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn missing_external_profile_is_preserved_until_explicit_selection() {
        let home = fixture();
        let missing = home.join("disconnected drive/profile");
        fs::create_dir_all(pointer(&home).parent().unwrap()).unwrap();
        fs::write(pointer(&home), serde_json::to_vec(&missing).unwrap()).unwrap();
        for parent in PARENTS {
            let link = home.join(parent).join("dev.paradise.code");
            fs::create_dir_all(link.parent().unwrap()).unwrap();
            symlink(missing.join(parent.replace('/', "-")), link).unwrap();
        }
        assert_eq!(saved_profile(&home).unwrap(), Some(missing.clone()));
        let new = default_profile(&home);
        fs::create_dir_all(&new).unwrap();
        select_profile(&home, &new).unwrap();
        assert_eq!(saved_profile(&home).unwrap(), Some(new.clone()));
        assert!(!missing.exists());
        assert_eq!(
            fs::read_link(home.join("Library/WebKit/dev.paradise.code")).unwrap(),
            new.join("Library-WebKit")
        );
        let old: PathBuf = serde_json::from_slice(
            &fs::read(pointer(&home).with_extension("json.previous")).unwrap(),
        )
        .unwrap();
        assert_eq!(old, missing);
        fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn never_overwrites_existing_directories() {
        let home = fixture();
        let old = home.join("Library/WebKit/dev.paradise.code");
        fs::create_dir_all(&old).unwrap();
        fs::write(old.join("keep"), "saved work").unwrap();
        let new = default_profile(&home);
        fs::create_dir_all(&new).unwrap();
        assert!(select_profile(&home, &new).is_err());
        assert_eq!(fs::read_to_string(old.join("keep")).unwrap(), "saved work");
        assert!(!pointer(&home).exists());
        fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn rejects_relative_or_missing_destinations() {
        let home = fixture();
        assert!(select_profile(&home, Path::new("relative")).is_err());
        assert!(select_profile(&home, &home.join("absent")).is_err());
        fs::remove_dir_all(home).unwrap();
    }
    #[test]
    fn refuses_to_switch_while_old_profile_is_running() {
        let home = fixture();
        let old = home.join("old");
        let new = home.join("new");
        fs::create_dir_all(&old).unwrap();
        fs::create_dir_all(&new).unwrap();
        fs::create_dir_all(pointer(&home).parent().unwrap()).unwrap();
        fs::write(pointer(&home), serde_json::to_vec(&old).unwrap()).unwrap();
        let lock = crate::private_options()
            .write(true)
            .create(true)
            .truncate(false)
            .open(old.join("app.lock"))
            .unwrap();
        assert_eq!(lock.try_lock().map(|_| 0).unwrap_or(-1), 0);
        assert!(select_profile(&home, &new).is_err());
        assert_eq!(saved_profile(&home).unwrap(), Some(old));
        drop(lock);
        fs::remove_dir_all(home).unwrap();
    }
}
