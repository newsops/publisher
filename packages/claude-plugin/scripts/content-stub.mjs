// PLUG-001: archive validation is not bundled. `@publisher/content` pulls the
// Markdown/HTML toolchain (~600 KB minified) and `content inspect`/`content
// restore` are operations commands outside the desk scope; the workspace CLI
// keeps them. The plugin contract scan forbids referencing those commands.
function unavailable() {
  throw new Error(
    'archive validation is not bundled in the plugin CLI; use the workspace publisher CLI',
  )
}
export const validateEditorialArchive = unavailable
export const archiveSummary = unavailable
