'use client';

import { clsx } from 'clsx';
import { Save } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { AdminPageShell } from '../../../components/admin/AdminPageShell';
import { useToast } from '../../../context/ToastContext';
import { adminApi, clearAdminPublicConfigCache } from '../../../lib/api';

type AppSetting = { id: string; key: string; valueJson: unknown };

const ADMIN_UI_COPY_KEYS = [
  'searchPlaceholder',
  'notificationsTitle',
  'markAllRead',
  'viewAllActivity',
  'emptyNotifications',
  'searching',
  'noResults',
  'usersSearchPlaceholder',
  'reportsSearchPlaceholder',
  'subscriptionsSearchPlaceholder',
  'auditLogsSearchPlaceholder',
  'usersEmptyState',
  'reportsEmptyState',
  'subscriptionsEmptyState',
] as const;

type AdminUiCopyKey = (typeof ADMIN_UI_COPY_KEYS)[number];

const KEY_META = {
  free_swipe_daily_limit: 'number',
  premium_unlimited_swipes_enabled: 'boolean',
  verified_only_filter_enabled: 'boolean',
  premium_direct_message_enabled: 'boolean',
  trial_days: 'number',
  premium_monthly_price_usd: 'number',
  premium_yearly_price_usd: 'number',
  auto_review_threshold: 'number',
  support_contact_email: 'string',
  admin_report_moderation_guidelines: 'string',
  admin_verification_guidelines: 'string',
  admin_ui_copy: 'string',
  maintenance_mode: 'boolean',
  public_support_contact: 'string',
  admin_brand_name: 'string',
} as const;

type KnownKey = keyof typeof KEY_META;

const KNOWN_KEYS = new Set<string>(Object.keys(KEY_META));

/** Only used when a key has no row in DB yet — neutral so we never show invented business data. */
const EMPTY_DEFAULTS: Record<KnownKey, string | number | boolean> = {
  free_swipe_daily_limit: 0,
  premium_unlimited_swipes_enabled: false,
  verified_only_filter_enabled: false,
  premium_direct_message_enabled: false,
  trial_days: 0,
  premium_monthly_price_usd: 0,
  premium_yearly_price_usd: 0,
  auto_review_threshold: 0,
  support_contact_email: '',
  admin_report_moderation_guidelines: '',
  admin_verification_guidelines: '',
  admin_ui_copy: '',
  maintenance_mode: false,
  public_support_contact: '',
  admin_brand_name: '',
};

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === 'boolean') return v;
  return fallback;
}

function asNum(v: unknown, fallback: number): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && v.trim() !== '') {
    const n = Number(v);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function asStr(v: unknown, fallback: string): string {
  if (typeof v === 'string') return v;
  return fallback;
}

function formFromRows(rows: AppSetting[]): Record<KnownKey, string | boolean> {
  const byKey = Object.fromEntries(rows.map((r) => [r.key, r.valueJson])) as Record<string, unknown>;
  const out = {} as Record<KnownKey, string | boolean>;
  (Object.keys(KEY_META) as KnownKey[]).forEach((key) => {
    const kind = KEY_META[key];
    const raw = byKey[key];
    if (kind === 'boolean') {
      out[key] = asBool(raw, EMPTY_DEFAULTS[key] as boolean);
    } else if (kind === 'number') {
      out[key] = String(asNum(raw, EMPTY_DEFAULTS[key] as number));
    } else {
      out[key] = asStr(raw, EMPTY_DEFAULTS[key] as string);
    }
  });
  return out;
}

function validateAdminUiCopy(rawValue: string): {
  valid: boolean;
  error: string | null;
  sanitized: Partial<Record<AdminUiCopyKey, string>>;
} {
  const raw = rawValue.trim();
  if (!raw) {
    return { valid: true, error: null, sanitized: {} };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false, error: 'admin_ui_copy must be valid JSON', sanitized: {} };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { valid: false, error: 'admin_ui_copy must be a JSON object', sanitized: {} };
  }

  const obj = parsed as Record<string, unknown>;
  const allowed = new Set<string>(ADMIN_UI_COPY_KEYS);
  const invalidKeys = Object.keys(obj).filter((k) => !allowed.has(k));
  if (invalidKeys.length > 0) {
    return {
      valid: false,
      error: `admin_ui_copy has unsupported keys: ${invalidKeys.join(', ')}`,
      sanitized: {},
    };
  }

  for (const keyName of ADMIN_UI_COPY_KEYS) {
    if (keyName in obj && typeof obj[keyName] !== 'string') {
      return {
        valid: false,
        error: `admin_ui_copy.${keyName} must be a string`,
        sanitized: {},
      };
    }
  }

  const sanitized: Partial<Record<AdminUiCopyKey, string>> = {};
  for (const keyName of ADMIN_UI_COPY_KEYS) {
    const val = obj[keyName];
    if (typeof val === 'string') {
      const trimmed = val.trim();
      if (trimmed) sanitized[keyName] = trimmed;
    }
  }
  return { valid: true, error: null, sanitized };
}

function serializeKey(key: KnownKey, form: Record<KnownKey, string | boolean>): unknown {
  const kind = KEY_META[key];
  const v = form[key];
  if (kind === 'boolean') return Boolean(v);
  if (kind === 'number') {
    const n = Number(String(v).trim());
    if (!Number.isFinite(n)) throw new Error(`Invalid number for ${key}`);
    return n;
  }
  if (key === 'admin_ui_copy') {
    const checked = validateAdminUiCopy(String(v));
    if (!checked.valid) throw new Error(checked.error ?? 'Invalid admin_ui_copy');
    return Object.keys(checked.sanitized).length > 0 ? checked.sanitized : '';
  }
  return String(v);
}

function SettingsSwitch({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={clsx(
        'relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-connect-600 focus:ring-offset-2 dark:focus:ring-offset-gray-900',
        checked ? 'bg-connect-600' : 'bg-gray-200 dark:bg-gray-600',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <span
        className={clsx(
          'pointer-events-none mt-0.5 inline-block h-5 w-5 rounded-full bg-white shadow transition',
          checked ? 'translate-x-6' : 'translate-x-0.5',
        )}
      />
    </button>
  );
}

function SettingsCard({
  title,
  subtitle,
  children,
  onSave,
  saving,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
  onSave: () => void;
  saving: boolean;
}) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm dark:border-gray-700 dark:bg-gray-800">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{title}</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>
      </div>
      <div className="space-y-6">{children}</div>
      <div className="mt-8 border-t border-gray-100 pt-6 dark:border-gray-700">
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-connect-700 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-connect-800 disabled:opacity-60 dark:bg-connect-600 dark:hover:bg-connect-700"
        >
          <Save className="h-4 w-4" aria-hidden />
          {saving ? 'Saving…' : 'Save changes'}
        </button>
      </div>
    </section>
  );
}

export default function AppSettingsPage() {
  const toast = useToast();
  const [settings, setSettings] = useState<AppSetting[]>([]);
  const [form, setForm] = useState<Record<KnownKey, string | boolean> | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [otherEditing, setOtherEditing] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    const s = await adminApi<AppSetting[]>('/admin/app-settings');
    setSettings(s);
    setForm(formFromRows(s));
    const nextOther: Record<string, string> = {};
    s.filter((x) => !KNOWN_KEYS.has(x.key)).forEach((x) => {
      nextOther[x.key] = JSON.stringify(x.valueJson, null, 2);
    });
    setOtherEditing(nextOther);
  }, []);

  useEffect(() => {
    load().catch(() => toast.error('Failed to load settings'));
  }, [load, toast]);

  const saveKeys = async (sectionId: string, keys: KnownKey[]) => {
    if (!form) return;
    setSaving(sectionId);
    try {
      for (const key of keys) {
        let valueJson: unknown;
        try {
          valueJson = serializeKey(key, form);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : 'Invalid value');
          return;
        }
        await adminApi('/admin/app-settings', {
          method: 'PATCH',
          body: JSON.stringify({ key, valueJson }),
        });
      }
      toast.success('Saved');
      await load();
      clearAdminPublicConfigCache();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(null);
    }
  };

  const setField = (key: KnownKey, value: string | boolean) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const otherRows = useMemo(() => settings.filter((x) => !KNOWN_KEYS.has(x.key)), [settings]);
  const uiCopyValidation = useMemo(
    () => validateAdminUiCopy(String(form?.admin_ui_copy ?? '')),
    [form?.admin_ui_copy],
  );

  const saveOther = async (key: string) => {
    const valueText = otherEditing[key] ?? '';
    let valueJson: unknown = valueText;
    try {
      valueJson = JSON.parse(valueText);
    } catch {
      /* plain string */
    }
    setSaving(`other:${key}`);
    try {
      await adminApi('/admin/app-settings', {
        method: 'PATCH',
        body: JSON.stringify({ key, valueJson }),
      });
      toast.success(`Saved ${key}`);
      await load();
      if (key === 'admin_brand_name') clearAdminPublicConfigCache();
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(null);
    }
  };

  if (!form) {
    return (
      <AdminPageShell title="App Settings">
        <p className="text-sm text-gray-500 dark:text-gray-400">Loading…</p>
      </AdminPageShell>
    );
  }

  return (
    <AdminPageShell title="App Settings">
      <div className="mx-auto max-w-3xl space-y-6">
        <SettingsCard
          title="Discovery & matching"
          subtitle="Control swipe limits and matching behavior"
          saving={saving === 'discovery'}
          onSave={() =>
            saveKeys('discovery', [
              'free_swipe_daily_limit',
              'premium_unlimited_swipes_enabled',
              'verified_only_filter_enabled',
              'premium_direct_message_enabled',
            ])
          }
        >
          <div>
            <label htmlFor="free_swipe_daily_limit" className="block text-sm font-medium text-gray-900 dark:text-white">
              Free user daily swipe limit
            </label>
            <input
              id="free_swipe_daily_limit"
              type="number"
              min={0}
              className="mt-1.5 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.free_swipe_daily_limit)}
              onChange={(e) => setField('free_swipe_daily_limit', e.target.value)}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Number of swipes per day for free users</p>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Premium unlimited swipes</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Allow premium users unlimited daily swipes</p>
            </div>
            <SettingsSwitch
              checked={Boolean(form.premium_unlimited_swipes_enabled)}
              onChange={(v) => setField('premium_unlimited_swipes_enabled', v)}
              disabled={saving === 'discovery'}
            />
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Verified-only filter</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Allow users to filter by GHIN verified only</p>
            </div>
            <SettingsSwitch
              checked={Boolean(form.verified_only_filter_enabled)}
              onChange={(v) => setField('verified_only_filter_enabled', v)}
              disabled={saving === 'discovery'}
            />
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Premium direct messaging</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Allow premium users to message without matching</p>
            </div>
            <SettingsSwitch
              checked={Boolean(form.premium_direct_message_enabled)}
              onChange={(v) => setField('premium_direct_message_enabled', v)}
              disabled={saving === 'discovery'}
            />
          </div>
        </SettingsCard>

        <SettingsCard
          title="Subscription settings"
          subtitle="Configure premium membership options"
          saving={saving === 'subscription'}
          onSave={() => saveKeys('subscription', ['trial_days', 'premium_monthly_price_usd', 'premium_yearly_price_usd'])}
        >
          <div>
            <label htmlFor="trial_days" className="block text-sm font-medium text-gray-900 dark:text-white">
              Trial days
            </label>
            <input
              id="trial_days"
              type="number"
              min={0}
              className="mt-1.5 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.trial_days)}
              onChange={(e) => setField('trial_days', e.target.value)}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Number of trial days for new premium users</p>
          </div>
          <div className="grid gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="premium_monthly_price_usd" className="block text-sm font-medium text-gray-900 dark:text-white">
                Monthly price ($)
              </label>
              <input
                id="premium_monthly_price_usd"
                type="number"
                min={0}
                step="0.01"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                value={String(form.premium_monthly_price_usd)}
                onChange={(e) => setField('premium_monthly_price_usd', e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="premium_yearly_price_usd" className="block text-sm font-medium text-gray-900 dark:text-white">
                Yearly price ($)
              </label>
              <input
                id="premium_yearly_price_usd"
                type="number"
                min={0}
                step="0.01"
                className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
                value={String(form.premium_yearly_price_usd)}
                onChange={(e) => setField('premium_yearly_price_usd', e.target.value)}
              />
            </div>
          </div>
        </SettingsCard>

        <SettingsCard
          title="Safety settings"
          subtitle="Configure moderation and safety thresholds"
          saving={saving === 'safety'}
          onSave={() =>
            saveKeys('safety', [
              'auto_review_threshold',
              'support_contact_email',
              'admin_report_moderation_guidelines',
              'admin_verification_guidelines',
            ])
          }
        >
          <div>
            <label htmlFor="auto_review_threshold" className="block text-sm font-medium text-gray-900 dark:text-white">
              Auto-review threshold
            </label>
            <input
              id="auto_review_threshold"
              type="number"
              min={0}
              className="mt-1.5 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.auto_review_threshold)}
              onChange={(e) => setField('auto_review_threshold', e.target.value)}
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">Number of reports before automatic admin review</p>
          </div>
          <div>
            <label htmlFor="support_contact_email" className="block text-sm font-medium text-gray-900 dark:text-white">
              Support email
            </label>
            <input
              id="support_contact_email"
              type="email"
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.support_contact_email)}
              onChange={(e) => setField('support_contact_email', e.target.value)}
            />
          </div>
          <div>
            <label
              htmlFor="admin_report_moderation_guidelines"
              className="block text-sm font-medium text-gray-900 dark:text-white"
            >
              Report moderation guidelines
            </label>
            <textarea
              id="admin_report_moderation_guidelines"
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.admin_report_moderation_guidelines)}
              onChange={(e) => setField('admin_report_moderation_guidelines', e.target.value)}
              placeholder="One guideline per line"
            />
          </div>
          <div>
            <label
              htmlFor="admin_verification_guidelines"
              className="block text-sm font-medium text-gray-900 dark:text-white"
            >
              GHIN verification guidelines
            </label>
            <textarea
              id="admin_verification_guidelines"
              rows={4}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.admin_verification_guidelines)}
              onChange={(e) => setField('admin_verification_guidelines', e.target.value)}
              placeholder="One guideline per line"
            />
          </div>
        </SettingsCard>

        <SettingsCard
          title="General settings"
          subtitle="App-wide configuration"
          saving={saving === 'general'}
          onSave={() =>
            saveKeys('general', ['admin_brand_name', 'maintenance_mode', 'public_support_contact', 'admin_ui_copy'])
          }
        >
          <div>
            <label htmlFor="admin_brand_name" className="block text-sm font-medium text-gray-900 dark:text-white">
              Admin brand name
            </label>
            <input
              id="admin_brand_name"
              type="text"
              maxLength={80}
              className="mt-1.5 w-full max-w-md rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.admin_brand_name)}
              onChange={(e) => setField('admin_brand_name', e.target.value)}
              placeholder="Shown on admin login and sidebar"
            />
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Public login page reads this from the database (no auth). Max 80 characters.
            </p>
          </div>
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">Maintenance mode</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">Temporarily disable app access for all users</p>
            </div>
            <SettingsSwitch
              checked={Boolean(form.maintenance_mode)}
              onChange={(v) => setField('maintenance_mode', v)}
              disabled={saving === 'general'}
            />
          </div>
          <div>
            <label htmlFor="public_support_contact" className="block text-sm font-medium text-gray-900 dark:text-white">
              Public support contact
            </label>
            <input
              id="public_support_contact"
              type="text"
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.public_support_contact)}
              onChange={(e) => setField('public_support_contact', e.target.value)}
              placeholder="Email, phone, or URL shown in the app"
            />
          </div>
          <div>
            <label htmlFor="admin_ui_copy" className="block text-sm font-medium text-gray-900 dark:text-white">
              Admin UI copy overrides (JSON)
            </label>
            <textarea
              id="admin_ui_copy"
              rows={6}
              className="mt-1.5 w-full rounded-lg border border-gray-200 bg-white px-3 py-2 font-mono text-xs text-gray-900 shadow-sm focus:border-connect-600 focus:outline-none focus:ring-1 focus:ring-connect-600 dark:border-gray-600 dark:bg-gray-900 dark:text-white"
              value={String(form.admin_ui_copy)}
              onChange={(e) => setField('admin_ui_copy', e.target.value)}
              placeholder='{"searchPlaceholder":"Search users...","notificationsTitle":"Notifications"}'
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  if (uiCopyValidation.valid) {
                    const count = Object.keys(uiCopyValidation.sanitized).length;
                    toast.success(count > 0 ? `Valid JSON (${count} key${count === 1 ? '' : 's'})` : 'Valid JSON');
                  } else {
                    toast.error(uiCopyValidation.error ?? 'Invalid JSON');
                  }
                }}
                className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-200 dark:hover:bg-gray-800"
              >
                Validate JSON
              </button>
              <span
                className={clsx(
                  'text-xs',
                  uiCopyValidation.valid ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300',
                )}
              >
                {uiCopyValidation.valid
                  ? `Looks good${Object.keys(uiCopyValidation.sanitized).length ? ` (${Object.keys(uiCopyValidation.sanitized).length} key${Object.keys(uiCopyValidation.sanitized).length === 1 ? '' : 's'})` : ''}.`
                  : uiCopyValidation.error}
              </span>
            </div>
            <p className="mt-1.5 text-xs text-gray-500 dark:text-gray-400">
              Optional JSON for top-bar copy: searchPlaceholder, notificationsTitle, markAllRead, viewAllActivity,
              emptyNotifications, searching, noResults, usersSearchPlaceholder, reportsSearchPlaceholder,
              subscriptionsSearchPlaceholder, auditLogsSearchPlaceholder, usersEmptyState, reportsEmptyState,
              subscriptionsEmptyState.
            </p>
          </div>
        </SettingsCard>

        {otherRows.length > 0 ? (
          <div className="rounded-xl border border-dashed border-gray-300 bg-white/80 p-6 dark:border-gray-600 dark:bg-gray-800/80">
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">Other settings</h2>
            <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
              Keys not shown above. Values are stored as JSON; invalid JSON is saved as plain text.
            </p>
            <div className="mt-4 space-y-4">
              {otherRows.map((setting) => (
                <div key={setting.id}>
                  <h3 className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">{setting.key}</h3>
                  <textarea
                    rows={4}
                    className="mt-2 w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 font-mono text-xs text-gray-900 dark:border-gray-600 dark:bg-gray-900 dark:text-gray-100"
                    value={otherEditing[setting.key] ?? ''}
                    onChange={(e) => setOtherEditing((prev) => ({ ...prev, [setting.key]: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => saveOther(setting.key)}
                    disabled={saving === `other:${setting.key}`}
                    className="mt-2 rounded-lg bg-gray-200 px-3 py-1.5 text-xs font-medium text-gray-900 hover:bg-gray-300 disabled:opacity-50 dark:bg-gray-700 dark:text-white dark:hover:bg-gray-600"
                  >
                    Save
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </AdminPageShell>
  );
}
