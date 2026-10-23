-- Preserve applied migration checksums; rename the prerelease domain forward.
ALTER TABLE publisher_admin.plugin_installations
  RENAME TO adapter_installations;
ALTER TABLE publisher_admin.adapter_installations
  RENAME COLUMN plugin_id TO adapter_id;
ALTER TABLE publisher_admin.adapter_installations
  RENAME CONSTRAINT plugin_installations_pkey TO adapter_installations_pkey;

UPDATE publisher_admin.adapter_installations
SET payload = (payload - 'pluginId') || jsonb_build_object('adapterId', adapter_id);
