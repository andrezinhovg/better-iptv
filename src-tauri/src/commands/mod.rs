// Command modules organized by domain
pub mod playback;
pub mod playlist;
pub mod channel;
pub mod epg;
pub mod series;
pub mod settings;
pub mod parental;
pub mod watch_progress;

// Re-export all commands for lib.rs
pub use playback::*;
pub use playlist::*;
pub use channel::*;
pub use epg::*;
pub use series::*;
pub use settings::*;
pub use parental::*;
pub use watch_progress::*;
