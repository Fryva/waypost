// waypost — scripts/codex-surface.mjs
// Tool surface `codex-no-exec-r1` (ADR harness-tool-surfaces-bound-by-evidence-
// instead-of-an-empty-tool-list): the version-specific lists the ADR leaves to a
// definition. It runs the user's own Codex installation and home (owner decision
// 2026-10-08); everything it changes is a session flag or a Waypost-written file. Read from codex-cli 0.162.0-alpha.2 and its negative-control probe
// (2026-10-08); any other version stays unverified.
import { createHash } from 'node:crypto';

const FEATURES_OFF = ['shell_tool', 'unified_exec', 'unified_exec_tty', 'sleep_tool', 'view_image', 'image_generation', 'multi_agent', 'multi_agent_v2', 'apps', 'plugins', 'remote_plugin', 'hooks', 'goals', 'memories', 'browser_use', 'browser_use_external', 'browser_use_full_cdp_access', 'computer_use', 'code_mode_host', 'tool_suggest', 'skill_mcp_dependency_install', 'skill_search', 'tool_call_mcp_elicitation', 'in_app_browser', 'in_app_local_automation', 'in_app_updates', 'daemon_auto_start', 'worktrees', 'realtime_conversation', 'guardian_approval'];

export const CODEX_SURFACE_R1 = Object.freeze({
  id: 'codex-no-exec-r1',
  version: '0.162.0-alpha.2',
  // The catalog Waypost pins is the model's entry from the user's own
  // models_cache.json with the tool-bearing keys removed, written content-addressed.
  catalog_cache: 'models_cache.json',
  // Instruction files the user's home may contribute; their content digests are bound.
  instruction_files: ['AGENTS.md', 'AGENTS.override.md'],
  // Session flags passed with -c on every launch; the user's files are never edited.
  features_off: FEATURES_OFF,
  // Effective values config/read must report under those flags (update_plan has no
  // config/read field; it is off by flag and any plan frame withdraws isolation).
  config_expect: { web_search: 'disabled', project_doc_max_bytes: 0, experimental_use_unified_exec_tool: false },
  overrides: [...FEATURES_OFF.map(f => `features.${f}=false`), 'web_search="disabled"', 'experimental_use_unified_exec_tool=false', 'tools.update_plan.enabled=false', 'tools.experimental_request_user_input.enabled=false', 'project_doc_max_bytes=0', 'check_for_update_on_startup=false'],
  // Enabled, non-removed features the thread may still report. `unified_exec` keeps
  // reporting enabled whatever the config says; the pinned catalog's
  // `shell_type: disabled` and the probe show it is not offered.
  allowed_features: ['unified_exec', 'shell_snapshot', 'content_item_kinds', 'write_stdin_approval', 'api_key_model_discovery', 'enable_request_compression', 'unbounded_connection_retries', 'system_proxy_fallback', 'browser_annotation_api', 'in_app_chat', 'in_app_dictation', 'in_app_voice', 'plugin_sharing', 'mentions_v2', 'guardian_reuse_parent_compaction', 'auth_elicitation', 'fast_mode', 'compaction_image_budget', 'workspace_dependencies'],
  // Catalog keys that switch tools on; the pinned entry must lack them or hold these values.
  catalog: { absent: ['tool_mode', 'multi_agent_version', 'apply_patch_tool_type', 'web_search_tool_type'], values: { shell_type: 'disabled', experimental_supported_tools: [], supports_search_tool: false, node_repl_disabled: true } },
  config_layers: ['sessionFlags', 'user', 'system'],
  // The user's config.toml also holds state the apps rewrite (notices, projects,
  // desktop); only these effective keys are bound into the configuration identity.
  // Skills, MCP servers and plugins are not: the set the plugins contribute varies
  // with load timing (live, 2026-10-08), and every one is verified off on each
  // launch instead (skills/list, mcpServerStatus/list, app/installed).
  config_keys: ['model', 'model_provider', 'model_providers', 'openai_base_url', 'chatgpt_base_url', 'approval_policy', 'sandbox_mode', 'web_search', 'tools', 'features', 'apps', 'hooks', 'memories', 'agents', 'model_catalog_json', 'project_doc_max_bytes', 'instructions', 'developer_instructions', 'model_instructions_file', 'browser_use', 'computer_use', 'goals', 'experimental_use_unified_exec_tool'],
  // Default deny during a turn: anything else withdraws isolation for the receipt.
  turn_methods: ['turn/started', 'turn/completed', 'item/started', 'item/completed', 'item/agentMessage/delta', 'item/reasoning/summaryTextDelta', 'item/reasoning/summaryPartAdded', 'item/reasoning/textDelta', 'thread/tokenUsage/updated', 'account/rateLimits/updated', 'account/updated', 'thread/status/changed', 'rawResponseItem/completed', 'rawResponse/completed', 'model/rerouted', 'warning', 'deprecationNotice', 'remoteControl/status/changed'],
  turn_items: ['userMessage', 'agentMessage', 'reasoning'],
  raw_items: ['message', 'reasoning'],
  residual_tools: [],
});
// Pinned catalogs the negative-control probe ran against through this transport on
// the user's installation (2026-10-08); a refreshed catalog stays unverified until
// probed again and added here.
export const PROBED_CATALOGS = new Set(['3085306bb82e2a1541b425f4239aaa73939860c755b871651a4a22e1e424490b']);
export const CODEX_SURFACE_R1_DIGEST = createHash('sha256').update(JSON.stringify(CODEX_SURFACE_R1)).digest('hex');
