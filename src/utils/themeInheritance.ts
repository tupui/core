import { defaultLightTheme } from '../constants/themes';
import type {
  IAppearance,
  IAppearanceConfig,
  IThemeInheritanceOptions,
  ThemeInheritance,
  ThemeInheritanceSource,
  ThemeVariableMap,
} from '../types';

type InheritableAppearanceKey = Exclude<keyof IAppearance, 'logo'>;
type ResolvedAppearancePatch = Partial<
  Pick<IAppearance, InheritableAppearanceKey>
>;

const SOURCES: readonly ThemeInheritanceSource[] = [
  'shadcn',
  'radix',
  'daisyui',
  'chakra',
  'mantine',
  'mui',
  'joy',
  'heroui',
  'bootstrap',
  'css',
];

const INHERITABLE_KEYS: readonly InheritableAppearanceKey[] = [
  'fontFamily',
  'textColor',
  'accentColor',
  'background',
  'fieldBackground',
  'borderRadius',
  'borderColor',
  'borderWidth',
  'backdropBlur',
  'backdropColor',
  'boxShadow',
  'outlineWidth',
  'outlineColor',
  'outlineRadius',
];

const OBSERVED_ATTRIBUTES = [
  'class',
  'style',
  'data-theme',
  'data-color-mode',
  'data-color-scheme',
  'data-mui-color-scheme',
  'data-mode',
];

const CUSTOM_PROPERTY_PATTERN = /^--[A-Za-z0-9_-]+$/;

const normalizePrefix = (prefix: string | undefined, fallback: string) => {
  if (prefix === undefined) return fallback;

  return prefix.trim().replace(/^--/, '').replace(/-+$/, '');
};

const prefixedVariable = (
  prefix: string | undefined,
  fallback: string,
  name: string,
) => {
  const normalized = normalizePrefix(prefix, fallback);

  return `--${normalized ? `${normalized}-` : ''}${name}`;
};

const normalizeInheritance = (
  inheritance: ThemeInheritance,
): IThemeInheritanceOptions => {
  const options =
    typeof inheritance === 'string' ? { source: inheritance } : inheritance;

  if (!SOURCES.includes(options.source)) {
    throw new Error(
      `BLUX: Unsupported appearance inheritance source '${String(options.source)}'.`,
    );
  }

  return options;
};

/** Returns the semantic CSS-variable map for a configured framework adapter. */
export const getThemeVariableMap = (
  options: IThemeInheritanceOptions,
): ThemeVariableMap => {
  const withPrefix = (fallback: string, name: string) =>
    prefixedVariable(options.prefix, fallback, name);

  switch (options.source) {
    case 'shadcn':
      return {
        textColor: '--foreground',
        accentColor: '--primary',
        background: '--background',
        borderRadius: '--radius',
        borderColor: '--border',
        outlineColor: '--ring',
        outlineRadius: '--radius',
      };
    case 'radix':
      return {
        fontFamily: '--default-font-family',
        accentColor: '--accent-9',
        background: '--color-panel-solid',
        fieldBackground: '--color-surface',
        backdropColor: '--color-overlay',
        boxShadow: '--shadow-6',
        outlineColor: '--focus-8',
      };
    case 'daisyui':
      return {
        textColor: '--color-base-content',
        accentColor: '--color-primary',
        background: '--color-base-100',
        borderRadius: '--radius-box',
        borderColor: '--color-base-300',
        borderWidth: '--border',
        outlineRadius: '--radius-box',
      };
    case 'chakra': {
      const map: ThemeVariableMap = {
        fontFamily: withPrefix('chakra', 'fonts-body'),
        textColor: withPrefix('chakra', 'colors-fg'),
        background: withPrefix('chakra', 'colors-bg-panel'),
        borderColor: withPrefix('chakra', 'colors-border'),
      };

      if (options.colorPalette) {
        map.accentColor = withPrefix(
          'chakra',
          `colors-${options.colorPalette}-solid`,
        );
        map.outlineColor = withPrefix(
          'chakra',
          `colors-${options.colorPalette}-focus-ring`,
        );
      }

      return map;
    }
    case 'mantine':
      return {
        fontFamily: '--mantine-font-family',
        textColor: '--mantine-color-text',
        accentColor: '--mantine-primary-color-filled',
        background: '--mantine-color-body',
        fieldBackground: '--mantine-color-default',
        borderRadius: '--mantine-radius-default',
        borderColor: '--mantine-color-default-border',
        outlineRadius: '--mantine-radius-default',
      };
    case 'mui':
      return {
        textColor: withPrefix('mui', 'palette-text-primary'),
        accentColor: withPrefix('mui', 'palette-primary-main'),
        background: withPrefix('mui', 'palette-background-paper'),
        borderRadius: withPrefix('mui', 'shape-borderRadius'),
        borderColor: withPrefix('mui', 'palette-divider'),
        outlineRadius: withPrefix('mui', 'shape-borderRadius'),
      };
    case 'joy':
      return {
        fontFamily: withPrefix('joy', 'fontFamily-body'),
        textColor: withPrefix('joy', 'palette-text-primary'),
        accentColor: withPrefix('joy', 'palette-primary-solidBg'),
        background: withPrefix('joy', 'palette-background-popup'),
        fieldBackground: withPrefix('joy', 'palette-background-surface'),
        borderRadius: withPrefix('joy', 'radius-md'),
        borderColor: withPrefix('joy', 'palette-divider'),
        backdropColor: withPrefix('joy', 'palette-background-backdrop'),
        boxShadow: withPrefix('joy', 'shadow-lg'),
        outlineColor: withPrefix('joy', 'palette-focusVisible'),
        outlineRadius: withPrefix('joy', 'radius-md'),
      };
    case 'heroui':
      return {
        textColor: '--overlay-foreground',
        accentColor: '--accent',
        background: '--overlay',
        fieldBackground: '--field-background',
        borderRadius: '--radius',
        borderColor: '--border',
        borderWidth: '--border-width',
        backdropColor: '--backdrop',
        boxShadow: '--overlay-shadow',
        outlineColor: '--focus',
        outlineRadius: '--radius',
      };
    case 'bootstrap':
      return {
        fontFamily: withPrefix('bs', 'body-font-family'),
        textColor: withPrefix('bs', 'body-color'),
        accentColor: withPrefix('bs', 'primary'),
        background: withPrefix('bs', 'body-bg'),
        borderRadius: withPrefix('bs', 'border-radius-lg'),
        borderColor: withPrefix('bs', 'border-color-translucent'),
        borderWidth: withPrefix('bs', 'border-width'),
        boxShadow: withPrefix('bs', 'box-shadow'),
        outlineWidth: withPrefix('bs', 'focus-ring-width'),
        outlineColor: withPrefix('bs', 'focus-ring-color'),
        outlineRadius: withPrefix('bs', 'border-radius-lg'),
      };
    case 'css': {
      const map: ThemeVariableMap = {};

      for (const key of INHERITABLE_KEYS) {
        const variable = options.variables?.[key];

        if (variable) map[key] = variable;
      }

      return map;
    }
  }
};

const isTransparent = (value: string) =>
  value === 'transparent' ||
  /^rgba\([^)]*,\s*0(?:\.0+)?\s*\)$/i.test(value) ||
  /^rgb\([^)]*\/\s*0(?:\.0+)?\s*\)$/i.test(value);

const isUsableValue = (key: InheritableAppearanceKey, value?: string) => {
  if (!value) return false;

  const normalized = value.trim();

  if (
    !normalized ||
    /var\s*\(/i.test(normalized) ||
    /(?:^|\s)(?:initial|inherit|unset|revert|revert-layer)(?:$|\s)/i.test(
      normalized,
    )
  ) {
    return false;
  }

  if (
    ['background', 'fieldBackground', 'textColor', 'accentColor'].includes(
      key,
    ) &&
    isTransparent(normalized)
  ) {
    return false;
  }

  if (key === 'backdropBlur' && /^-/.test(normalized)) return false;

  return true;
};

const getWindow = (scope: HTMLElement) =>
  scope.ownerDocument?.defaultView ??
  (typeof window === 'undefined' ? undefined : window);

const getComputed = (scope: HTMLElement, element: Element) => {
  const view = getWindow(scope);

  return view?.getComputedStyle(element) ?? getComputedStyle(element);
};

const resetProbe = (probe: HTMLElement) => {
  probe.style.color = '';
  probe.style.background = '';
  probe.style.backgroundColor = '';
  probe.style.fontFamily = '';
  probe.style.borderTop = '';
  probe.style.borderTopLeftRadius = '';
  probe.style.outline = '';
  probe.style.marginLeft = '';
  probe.style.boxShadow = '';
};

const resolveCssValue = (
  scope: HTMLElement,
  probe: HTMLElement,
  key: InheritableAppearanceKey,
  rawValue: string,
) => {
  resetProbe(probe);
  let value = '';

  switch (key) {
    case 'background':
    case 'fieldBackground': {
      probe.style.background = rawValue;
      if (!probe.style.background) return undefined;

      const computed = getComputed(scope, probe);
      value =
        computed.backgroundImage && computed.backgroundImage !== 'none'
          ? computed.backgroundImage
          : computed.backgroundColor;
      break;
    }
    case 'textColor':
    case 'accentColor':
    case 'borderColor':
    case 'backdropColor':
    case 'outlineColor':
      probe.style.color = rawValue;
      if (!probe.style.color) return undefined;
      value = getComputed(scope, probe).color;
      break;
    case 'fontFamily':
      probe.style.fontFamily = rawValue;
      if (!probe.style.fontFamily) return undefined;
      value = getComputed(scope, probe).fontFamily;
      break;
    case 'borderRadius':
    case 'outlineRadius':
      probe.style.borderTopLeftRadius = rawValue;
      if (!probe.style.borderTopLeftRadius) return undefined;
      value = getComputed(scope, probe).borderTopLeftRadius;
      break;
    case 'borderWidth':
      probe.style.borderTop = `${rawValue} solid`;
      if (!probe.style.borderTop) return undefined;
      value = getComputed(scope, probe).borderTopWidth;
      break;
    case 'outlineWidth':
      probe.style.outline = `${rawValue} solid`;
      if (!probe.style.outline) return undefined;
      value = getComputed(scope, probe).outlineWidth;
      break;
    case 'backdropBlur':
      probe.style.marginLeft = rawValue;
      if (!probe.style.marginLeft) return undefined;
      value = getComputed(scope, probe).marginLeft;
      break;
    case 'boxShadow':
      probe.style.boxShadow = rawValue;
      if (!probe.style.boxShadow) return undefined;
      value = getComputed(scope, probe).boxShadow;
      break;
  }

  value = value.trim();

  return isUsableValue(key, value) ? value : undefined;
};

const queryHostElement = (scope: HTMLElement, selector: string) => {
  try {
    const candidate = scope.matches(selector)
      ? scope
      : scope.querySelector<HTMLElement>(selector);

    if (candidate?.closest('#bluxcc-modal')) return null;

    return candidate;
  } catch {
    return null;
  }
};

const readComputedProperty = (
  scope: HTMLElement,
  selector: string,
  key: InheritableAppearanceKey,
  property: keyof CSSStyleDeclaration,
) => {
  const element = queryHostElement(scope, selector);

  if (!element) return undefined;

  const value = getComputed(scope, element)[property];

  return typeof value === 'string' && isUsableValue(key, value)
    ? value.trim()
    : undefined;
};

const readScopeProperty = (
  scope: HTMLElement,
  key: InheritableAppearanceKey,
  property: keyof CSSStyleDeclaration,
) => {
  const value = getComputed(scope, scope)[property];

  return typeof value === 'string' && isUsableValue(key, value)
    ? value.trim()
    : undefined;
};

const applyComputedFallbacks = (
  inherited: ResolvedAppearancePatch,
  options: IThemeInheritanceOptions,
  scope: HTMLElement,
) => {
  if (!inherited.fontFamily) {
    inherited.fontFamily = readScopeProperty(scope, 'fontFamily', 'fontFamily');
  }

  const inputSelector =
    'input:not([type="hidden"]), textarea, select, [role="textbox"]';

  switch (options.source) {
    case 'shadcn':
    case 'chakra':
    case 'mui':
      inherited.fieldBackground = readComputedProperty(
        scope,
        inputSelector,
        'fieldBackground',
        'backgroundColor',
      );
      break;
    case 'daisyui':
      inherited.fieldBackground = readComputedProperty(
        scope,
        `.input, ${inputSelector}`,
        'fieldBackground',
        'backgroundColor',
      );
      break;
    case 'radix': {
      const panel = '.rt-DialogContent, .radix-themes [role="dialog"]';
      inherited.textColor = readScopeProperty(scope, 'textColor', 'color');
      inherited.background =
        readComputedProperty(scope, panel, 'background', 'backgroundColor') ??
        inherited.background;
      inherited.borderRadius = readComputedProperty(
        scope,
        panel,
        'borderRadius',
        'borderTopLeftRadius',
      );
      inherited.borderColor = readComputedProperty(
        scope,
        panel,
        'borderColor',
        'borderTopColor',
      );
      if (inherited.borderRadius) {
        inherited.outlineRadius = inherited.borderRadius;
      }
      break;
    }
    case 'bootstrap': {
      const modal = '.modal-content';
      inherited.fieldBackground = readComputedProperty(
        scope,
        '.form-control',
        'fieldBackground',
        'backgroundColor',
      );
      inherited.background =
        readComputedProperty(scope, modal, 'background', 'backgroundColor') ??
        inherited.background;
      inherited.borderColor =
        readComputedProperty(scope, modal, 'borderColor', 'borderTopColor') ??
        inherited.borderColor;
      inherited.borderWidth =
        readComputedProperty(scope, modal, 'borderWidth', 'borderTopWidth') ??
        inherited.borderWidth;
      inherited.borderRadius =
        readComputedProperty(
          scope,
          modal,
          'borderRadius',
          'borderTopLeftRadius',
        ) ?? inherited.borderRadius;
      inherited.boxShadow =
        readComputedProperty(scope, modal, 'boxShadow', 'boxShadow') ??
        inherited.boxShadow;
      if (inherited.borderRadius) {
        inherited.outlineRadius = inherited.borderRadius;
      }
      break;
    }
    case 'mantine':
    case 'joy':
    case 'heroui':
    case 'css':
      break;
  }
};

const resolveScope = (
  options: IThemeInheritanceOptions,
  mountElement: HTMLElement,
) => {
  if (!options.scope) return mountElement;
  if (typeof options.scope !== 'string') return options.scope;

  try {
    return (
      mountElement.closest<HTMLElement>(options.scope) ??
      mountElement.querySelector<HTMLElement>(options.scope) ??
      mountElement.ownerDocument.querySelector<HTMLElement>(options.scope) ??
      mountElement
    );
  } catch {
    console.warn(
      `BLUX: '${options.scope}' is not a valid theme scope selector; using the mount element.`,
    );

    return mountElement;
  }
};

const inheritedAppearance = (
  options: IThemeInheritanceOptions,
  mountElement: HTMLElement,
): ResolvedAppearancePatch => {
  const scope = resolveScope(options, mountElement);
  const documentRef = scope.ownerDocument;
  const probe = documentRef.createElement('span');
  const inherited: ResolvedAppearancePatch = {};

  probe.setAttribute('aria-hidden', 'true');
  probe.style.cssText =
    'position:absolute!important;visibility:hidden!important;pointer-events:none!important;inset:auto!important;';

  try {
    scope.appendChild(probe);
  } catch {
    return inherited;
  }

  try {
    const computedScope = getComputed(scope, scope);
    const variables = getThemeVariableMap(options);

    for (const key of INHERITABLE_KEYS) {
      const variable = variables[key];

      if (!variable || !CUSTOM_PROPERTY_PATTERN.test(variable)) continue;

      const rawValue = computedScope.getPropertyValue(variable).trim();

      if (!rawValue) continue;

      const resolved = resolveCssValue(scope, probe, key, rawValue);

      if (resolved) inherited[key] = resolved;
    }

    applyComputedFallbacks(inherited, options, scope);
  } finally {
    probe.remove();
  }

  return inherited;
};

const explicitAppearance = (
  appearance: IAppearanceConfig = {},
): Partial<IAppearance> => {
  const explicit: Partial<IAppearance> = {};

  for (const key of ['logo', ...INHERITABLE_KEYS] as const) {
    const value = appearance[key];

    if (value !== undefined) explicit[key] = value;
  }

  return explicit;
};

/** Resolves one appearance snapshot using defaults, inherited values, then overrides. */
export const resolveThemeAppearance = (
  appearance: IAppearanceConfig | undefined,
  mountElement: HTMLElement,
): IAppearance => {
  const inheritance = appearance?.inherit;
  const inherited = inheritance
    ? inheritedAppearance(normalizeInheritance(inheritance), mountElement)
    : {};

  return {
    ...defaultLightTheme,
    ...inherited,
    ...explicitAppearance(appearance),
  };
};

const appearancesMatch = (left: IAppearance, right: IAppearance) =>
  (['logo', ...INHERITABLE_KEYS] as const).every(
    (key) => left[key] === right[key],
  );

class ThemeInheritanceController {
  private appearance: IAppearanceConfig;
  private current: IAppearance;
  private observer?: MutationObserver;
  private media?: MediaQueryList;
  private refreshQueued = false;

  constructor(
    appearance: IAppearanceConfig | undefined,
    private readonly mountElement: HTMLElement,
    private readonly apply: (appearance: IAppearance) => void,
  ) {
    this.appearance = { ...appearance };
    this.current = resolveThemeAppearance(this.appearance, mountElement);
  }

  get value() {
    return this.current;
  }

  start() {
    this.bindWatchers();
  }

  stop() {
    this.observer?.disconnect();
    this.observer = undefined;

    if (this.media) {
      const legacyMedia = this.media as MediaQueryList & {
        removeListener?: (listener: () => void) => void;
      };

      if (typeof this.media.removeEventListener === 'function') {
        this.media.removeEventListener('change', this.queueRefresh);
      } else {
        legacyMedia.removeListener?.(this.queueRefresh);
      }
    }

    this.media = undefined;
  }

  update(patch: IAppearanceConfig) {
    const nextAppearance = { ...this.appearance };

    const inheritanceChanged = Object.prototype.hasOwnProperty.call(
      patch,
      'inherit',
    );

    if (inheritanceChanged) {
      nextAppearance.inherit = patch.inherit;
    }

    for (const key of ['logo', ...INHERITABLE_KEYS] as const) {
      if (!Object.prototype.hasOwnProperty.call(patch, key)) continue;

      const value = patch[key];

      if (value === undefined) {
        delete nextAppearance[key];
      } else {
        nextAppearance[key] = value;
      }
    }

    this.appearance = nextAppearance;

    if (inheritanceChanged) {
      this.stop();
      this.bindWatchers();
    }

    this.refresh();
  }

  private readonly queueRefresh = () => {
    if (this.refreshQueued) return;

    this.refreshQueued = true;
    queueMicrotask(() => {
      this.refreshQueued = false;
      this.refresh();
    });
  };

  private refresh() {
    const next = resolveThemeAppearance(this.appearance, this.mountElement);

    if (appearancesMatch(this.current, next)) return;

    this.current = next;
    this.apply(next);
  }

  private bindWatchers() {
    if (!this.appearance.inherit) return;

    const options = normalizeInheritance(this.appearance.inherit);
    const scope = resolveScope(options, this.mountElement);
    const view = getWindow(scope);

    if (view?.MutationObserver) {
      this.observer = new view.MutationObserver(this.queueRefresh);

      for (
        let element: HTMLElement | null = scope;
        element;
        element = element.parentElement
      ) {
        this.observer.observe(element, {
          attributes: true,
          attributeFilter: OBSERVED_ATTRIBUTES,
        });
      }
    }

    this.media = view?.matchMedia?.('(prefers-color-scheme: dark)');

    if (this.media) {
      const legacyMedia = this.media as MediaQueryList & {
        addListener?: (listener: () => void) => void;
      };

      if (typeof this.media.addEventListener === 'function') {
        this.media.addEventListener('change', this.queueRefresh);
      } else {
        legacyMedia.addListener?.(this.queueRefresh);
      }
    }
  }
}

let controller: ThemeInheritanceController | undefined;

/** Starts a single inheritance lifecycle for the active Blux configuration. */
export const configureThemeInheritance = (
  appearance: IAppearanceConfig | undefined,
  mountElement: HTMLElement,
  apply: (appearance: IAppearance) => void,
) => {
  controller?.stop();
  controller = new ThemeInheritanceController(appearance, mountElement, apply);
  controller.start();

  return controller.value;
};

/** Applies a public appearance patch while preserving inheritance precedence. */
export const updateThemeAppearance = (patch: IAppearanceConfig) => {
  if (!controller) return false;

  controller.update(patch);

  return true;
};
