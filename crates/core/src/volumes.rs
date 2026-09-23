//! Inspecting a mounted volume: does it look like a camera card, how many
//! clips does it hold, and how much media.

use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};

use serde::Serialize;

use crate::error::{CoreError, Result};

const MAX_DEPTH: usize = 6;
const MAX_ENTRIES: usize = 200_000;
const VIDEO: &[&str] = &[
    "mov", "mp4", "mxf", "braw", "r3d", "crm", "mts", "m4v", "avi",
];
const FRAMES: &[&str] = &["ari", "arx", "dng"];
const AUDIO: &[&str] = &["wav", "bwf"];

/// Which kind of card a volume looks like, and the evidence.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct CardGuess {
    pub kind: String,
    pub evidence: String,
}

/// What is on a volume.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct VolumeReport {
    pub root: PathBuf,
    pub card: Option<CardGuess>,
    pub clip_count: u64,
    pub media_bytes: u64,
    pub top_level: Vec<String>,
    pub truncated: bool,
}

fn skip(name: &str) -> bool {
    name.starts_with('.')
        || name.starts_with('$')
        || name.eq_ignore_ascii_case("System Volume Information")
}

fn rel_key(rel: &Path) -> String {
    rel.components()
        .map(|c| c.as_os_str().to_string_lossy().to_ascii_lowercase())
        .collect::<Vec<_>>()
        .join("/")
}

fn guess_card(dirs: &BTreeSet<String>, exts: &BTreeSet<String>) -> Option<CardGuess> {
    let dir = |p: &str| dirs.contains(p);
    let ext = |e: &str| exts.contains(e);
    let found = |kind: &str, evidence: &str| {
        Some(CardGuess {
            kind: kind.into(),
            evidence: evidence.into(),
        })
    };
    if dir("private/m4root") {
        return found("sony", "PRIVATE/M4ROOT");
    }
    if dir("private/xdroot") || dir("xdroot") {
        return found("sony", "XDROOT");
    }
    if dir("contents/clips001") {
        return found("canon", "CONTENTS/CLIPS001");
    }
    if ext("crm") {
        return found("canon", ".CRM files");
    }
    if dir("private/pana_grp") || dir("contents/video") {
        return found("panasonic", "PRIVATE/PANA_GRP or CONTENTS/VIDEO");
    }
    if ext("r3d")
        || dirs
            .iter()
            .any(|d| d.ends_with(".rdm") || d.ends_with(".rdc"))
    {
        return found("red", ".R3D / .RDM");
    }
    if ext("ari") || ext("arx") {
        return found("arri", "ARRIRAW frames");
    }
    if ext("braw") {
        return found("blackmagic", ".braw files");
    }
    if dir("private/avchd") {
        return found("avchd", "PRIVATE/AVCHD");
    }
    if dir("dcim") {
        return found("dcim", "DCIM");
    }
    if (ext("wav") || ext("bwf")) && !VIDEO.iter().any(|v| ext(v)) {
        return found("audio", "WAV files");
    }
    None
}

/// Inspect the volume (or any folder) at `root`.
pub fn inspect_volume(root: &Path) -> Result<VolumeReport> {
    if !root.is_dir() {
        return Err(CoreError::Validation(format!(
            "{} is not a folder",
            root.display()
        )));
    }
    let mut top_level: Vec<String> = fs::read_dir(root)
        .map_err(|e| CoreError::io(root, e))?
        .filter_map(|e| e.ok())
        .map(|e| e.file_name().to_string_lossy().into_owned())
        .filter(|n| !skip(n))
        .collect();
    top_level.sort();

    let mut dirs = BTreeSet::new();
    let mut exts = BTreeSet::new();
    let mut frame_dirs = BTreeSet::new();
    let (mut clips, mut bytes, mut seen, mut truncated) = (0u64, 0u64, 0usize, false);
    let mut stack = vec![(root.to_path_buf(), 0usize)];
    'walk: while let Some((dir, depth)) = stack.pop() {
        let Ok(entries) = fs::read_dir(&dir) else {
            continue;
        };
        for entry in entries.filter_map(|e| e.ok()) {
            seen += 1;
            if seen > MAX_ENTRIES {
                truncated = true;
                break 'walk;
            }
            let name = entry.file_name().to_string_lossy().into_owned();
            if skip(&name) {
                continue;
            }
            let path = entry.path();
            let Ok(file_type) = entry.file_type() else {
                continue;
            };
            if file_type.is_dir() {
                if let Ok(rel) = path.strip_prefix(root) {
                    dirs.insert(rel_key(rel));
                }
                if depth + 1 < MAX_DEPTH {
                    stack.push((path, depth + 1));
                } else {
                    truncated = true;
                }
            } else if file_type.is_file() {
                let ext = path
                    .extension()
                    .map(|e| e.to_string_lossy().to_ascii_lowercase())
                    .unwrap_or_default();
                let size = || entry.metadata().map(|m| m.len()).unwrap_or(0);
                if VIDEO.contains(&ext.as_str()) {
                    clips += 1;
                    bytes += size();
                } else if FRAMES.contains(&ext.as_str()) {
                    frame_dirs.insert(dir.clone());
                    bytes += size();
                } else if AUDIO.contains(&ext.as_str()) {
                    bytes += size();
                }
                if !ext.is_empty() {
                    exts.insert(ext);
                }
            }
        }
    }
    clips += frame_dirs.len() as u64;
    Ok(VolumeReport {
        root: root.to_path_buf(),
        card: guess_card(&dirs, &exts),
        clip_count: clips,
        media_bytes: bytes,
        top_level,
        truncated,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn touch(root: &Path, rel: &str, bytes: usize) {
        let path = root.join(rel);
        fs::create_dir_all(path.parent().unwrap()).unwrap();
        fs::write(path, vec![0u8; bytes]).unwrap();
    }

    fn card(root: &Path) -> Option<String> {
        inspect_volume(root).unwrap().card.map(|c| c.kind)
    }

    #[test]
    fn sony_card() {
        let d = tempfile::tempdir().unwrap();
        touch(d.path(), "PRIVATE/M4ROOT/CLIP/C0001.MP4", 10);
        touch(d.path(), "PRIVATE/M4ROOT/CLIP/C0002.MP4", 20);
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(
            r.card,
            Some(CardGuess {
                kind: "sony".into(),
                evidence: "PRIVATE/M4ROOT".into()
            })
        );
        assert_eq!((r.clip_count, r.media_bytes), (2, 30));
        assert_eq!(r.top_level, vec!["PRIVATE"]);
        assert!(!r.truncated);
    }

    #[test]
    fn arri_frames_count_per_folder() {
        let d = tempfile::tempdir().unwrap();
        touch(
            d.path(),
            "A001C001_250923_R1AB/A001C001_250923_R1AB.0000001.ari",
            5,
        );
        touch(
            d.path(),
            "A001C001_250923_R1AB/A001C001_250923_R1AB.0000002.ari",
            5,
        );
        touch(
            d.path(),
            "A001C002_250923_R1AB/A001C002_250923_R1AB.0000001.ari",
            5,
        );
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("arri"));
        assert_eq!((r.clip_count, r.media_bytes), (2, 15));
    }

    #[test]
    fn other_card_kinds() {
        let red = tempfile::tempdir().unwrap();
        touch(
            red.path(),
            "A001_0923XY.RDM/A001_C001_0923XY.RDC/A001_C001_0923XY_001.R3D",
            4,
        );
        assert_eq!(card(red.path()).as_deref(), Some("red"));
        assert_eq!(inspect_volume(red.path()).unwrap().clip_count, 1);

        let bm = tempfile::tempdir().unwrap();
        touch(bm.path(), "A001_09231200_C001.braw", 4);
        assert_eq!(card(bm.path()).as_deref(), Some("blackmagic"));

        let canon = tempfile::tempdir().unwrap();
        touch(canon.path(), "contents/clips001/A001C001.CRM", 4);
        assert_eq!(card(canon.path()).as_deref(), Some("canon"));

        let dcim = tempfile::tempdir().unwrap();
        touch(dcim.path(), "DCIM/100MEDIA/IMG_0001.JPG", 4);
        let r = inspect_volume(dcim.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("dcim"));
        assert_eq!(r.clip_count, 0);

        let audio = tempfile::tempdir().unwrap();
        touch(audio.path(), "ZOOM0001/ZOOM0001_LR.WAV", 8);
        let r = inspect_volume(audio.path()).unwrap();
        assert_eq!(r.card.map(|c| c.kind).as_deref(), Some("audio"));
        assert_eq!((r.clip_count, r.media_bytes), (0, 8));

        let lower = tempfile::tempdir().unwrap();
        touch(lower.path(), "private/m4root/clip/c0001.mp4", 1);
        assert_eq!(card(lower.path()).as_deref(), Some("sony"));
    }

    #[test]
    fn empty_hidden_and_invalid() {
        let d = tempfile::tempdir().unwrap();
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!((r.card, r.clip_count, r.media_bytes), (None, 0, 0));
        touch(d.path(), ".Spotlight-V100/x.mov", 9);
        touch(d.path(), "System Volume Information/y.mov", 9);
        touch(d.path(), "$RECYCLE.BIN/z.mov", 9);
        let r = inspect_volume(d.path()).unwrap();
        assert_eq!(r.clip_count, 0);
        assert!(r.top_level.is_empty(), "{:?}", r.top_level);
        assert!(matches!(
            inspect_volume(&d.path().join("missing")).unwrap_err(),
            CoreError::Validation(_)
        ));
    }

    #[test]
    fn depth_limit_marks_truncated() {
        let d = tempfile::tempdir().unwrap();
        touch(d.path(), "1/2/3/4/5/6/7/deep.mov", 1);
        let r = inspect_volume(d.path()).unwrap();
        assert!(r.truncated);
        assert_eq!(r.clip_count, 0);
    }

    #[test]
    fn more_card_kinds_and_first_match_wins() {
        let pana = tempfile::tempdir().unwrap();
        touch(pana.path(), "PRIVATE/PANA_GRP/001RAAAA/CLIP/A001.MOV", 5);
        assert_eq!(card(pana.path()).as_deref(), Some("panasonic"));

        let avchd = tempfile::tempdir().unwrap();
        touch(avchd.path(), "PRIVATE/AVCHD/BDMV/STREAM/00000.MTS", 7);
        assert_eq!(card(avchd.path()).as_deref(), Some("avchd"));

        let sony_wins = tempfile::tempdir().unwrap();
        touch(sony_wins.path(), "PRIVATE/M4ROOT/CLIP/C0001.MP4", 10);
        touch(sony_wins.path(), "A001_C001.R3D", 4);
        assert_eq!(card(sony_wins.path()).as_deref(), Some("sony"));

        let braw_wins = tempfile::tempdir().unwrap();
        touch(braw_wins.path(), "DCIM/100MEDIA/C0001.MP4", 10);
        touch(braw_wins.path(), "x.braw", 5);
        assert_eq!(card(braw_wins.path()).as_deref(), Some("blackmagic"));
    }
}
