//! Timestamps HedgeBuddy writes.

/// Now, in UTC, as RFC 3339 with milliseconds: `2026-09-23T14:02:11.482Z`.
/// Run records from the Python library use the same form.
pub fn now_rfc3339() -> String {
    jiff::Timestamp::now()
        .strftime("%Y-%m-%dT%H:%M:%S%.3fZ")
        .to_string()
}

#[cfg(test)]
mod tests {
    #[test]
    fn timestamps_are_utc_with_milliseconds() {
        let ts = super::now_rfc3339();
        let bytes = ts.as_bytes();
        assert_eq!(ts.len(), 24, "{ts}");
        assert_eq!(
            (bytes[4], bytes[10], bytes[19], bytes[23]),
            (b'-', b'T', b'.', b'Z'),
            "{ts}"
        );
        assert!(ts.parse::<jiff::Timestamp>().is_ok(), "{ts}");
    }
}
