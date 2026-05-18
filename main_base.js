// Base UI-only script (no data)
(() => {
  const body = document.body;
  const PLACEHOLDER_IMG = "assets/ui/rainbow_box_icon.png";
  const TRANSPARENT_PX = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABAAAAAA==";

  // Data sources (from legacy code)
  const UNITS_URL = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/refs/heads/master/common/data/units.js";
  const EVOLUTIONS_URL = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/refs/heads/master/common/data/evolutions.js";
  const FLAGS_URL = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/refs/heads/master/common/data/flags.js";
  const FAMILIES_URL = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/refs/heads/master/common/data/families.js";
  const DROPS_URL = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/refs/heads/master/common/data/drops.js";
  const THUMB_PRIMARY = "https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io@master/api/images/thumbnail/glo";
  const THUMB_FALLBACK = "https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io@master/api/images/thumbnail/jap";
  const ART_BASE = "https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io@master/api/images/full/transparent";
  const ART_BASE_NOREF = "https://cdn.jsdelivr.net/gh/2Shankz/optc-db.github.io/api/images/full/transparent";
  const ART_BASE_RAW = "https://raw.githubusercontent.com/2Shankz/optc-db.github.io/master/api/images/full/transparent";
  const EXCLUDED_IDS = new Set(["591","592","593","594","595","578","963","964","965"]);
  const THUMB_JAP_PRIMARY_IDS = new Set(["4170","2909","2830","2784","4167"]);
  const THUMB_ID_OVERRIDES = new Map([["231", "232"], ["232", "231"]]);

  // ===== Ships =====
  const SHIPS_DATA_URL = "https://raw.githubusercontent.com/blzn50/optc-ships/refs/heads/master/src/data/units.ts";
  const SHIPS_DETAILS_URL = "https://raw.githubusercontent.com/blzn50/optc-ships/refs/heads/master/src/data/details.ts";
  const SHIPS_THUMB_BASE = "https://raw.githubusercontent.com/blzn50/optc-ships/master/public/icon";
  const SHIPS_ART_BASE = "https://raw.githubusercontent.com/blzn50/optc-ships/master/public/full";
  const SHIPS_DATA_CACHE_KEY = "ships:data:v3";
  const SHIPS_DATA_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const SHIPS_STATE_KEY = "ships:state:v2";
  const SHIP_LEVEL_MIN = 1;
  const SHIP_LEVEL_MAX = 10;
  let shipsList = [];
  let shipsLoaded = false;
  let shipsLoadingPromise = null;
  function readShipsState() {
    try {
      const raw = localStorage.getItem(SHIPS_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return (parsed && typeof parsed === "object" && !Array.isArray(parsed)) ? parsed : {};
    } catch { return {}; }
  }
  let shipsState = readShipsState();
  function persistShipsState() {
    try { localStorage.setItem(SHIPS_STATE_KEY, JSON.stringify(shipsState)); } catch {}
  }
  function getShipEntry(idx) {
    const cur = shipsState[String(idx)];
    if (cur && typeof cur === "object") {
      const owned = !!cur.owned;
      const lvl = Math.max(SHIP_LEVEL_MIN, Math.min(SHIP_LEVEL_MAX, parseInt(cur.level, 10) || SHIP_LEVEL_MIN));
      return { owned, level: lvl };
    }
    return { owned: false, level: SHIP_LEVEL_MIN };
  }
  function setShipEntry(idx, patch) {
    const cur = getShipEntry(idx);
    const next = { ...cur, ...patch };
    next.level = Math.max(SHIP_LEVEL_MIN, Math.min(SHIP_LEVEL_MAX, parseInt(next.level, 10) || SHIP_LEVEL_MIN));
    next.owned = !!next.owned;
    if (!next.owned && next.level === SHIP_LEVEL_MIN) {
      delete shipsState[String(idx)];
    } else {
      shipsState[String(idx)] = { owned: next.owned, level: next.level };
    }
    persistShipsState();
  }
  function getShipIconNumber(thumb) {
    const match = String(thumb || "").match(/^ship_(\d{4})(?:_(?:t2|thumbnail))?\.png$/i);
    return match ? parseInt(match[1], 10) : 0;
  }
  function formatShipIconFilename(num) {
    return Number.isFinite(num) && num > 0 ? `ship_${String(num).padStart(4, "0")}_thumbnail.png` : "";
  }
  function formatShipArtworkFilename(num) {
    return Number.isFinite(num) && num > 0 ? `ship_${String(num).padStart(4, "0")}_full.png` : "";
  }
  function shipIconFilename(thumb) {
    const raw = String(thumb || "");
    const iconNumber = getShipIconNumber(raw);
    return iconNumber ? formatShipIconFilename(iconNumber) : raw;
  }
  function stripTypeScriptImports(text) {
    return String(text || "").replace(/^import[^\n]*\n/gm, "");
  }
  function getPSTTimestamp(dateString) {
    return new Date(String(dateString || "") + "-08:00").getTime();
  }
  function convertToPSTTimestamp() {
    const dateTime = new Date();
    dateTime.setHours(dateTime.getUTCHours() - 8);
    return dateTime.getTime();
  }
  function parseShipsDetailsSource(text) {
    try {
      const source = stripTypeScriptImports(text)
        .replace(/export\s+const\s+details\s*:\s*Record<number,\s*ShipInfo>\s*=\s*/, "const details = ");
      return new Function(`${source}\n;return details||{};`)();
    } catch (e) { console.warn("[ships] details parse failed", e); return {}; }
  }
  function withShipDetailsFallback(details) {
    const source = (details && typeof details === "object") ? details : {};
    return new Proxy(source, {
      get(target, prop) {
        if (prop in target) return target[prop];
        return { effect: [] };
      }
    });
  }
  function parseShipUnitsSource(text, details = {}) {
    try {
      const source = stripTypeScriptImports(text)
        .replace(/export\s+const\s+units\s*:\s*ShipOverview\[\]\s*=\s*/, "const units = ")
        .replace(/export\s+const\s+unitsCount\s*=\s*units\.length\s*;?/g, "");
      const fn = new Function("details", "convertToPSTTimestamp", "getPSTTimestamp", `${source}\n;return units||[];`);
      const arr = fn(withShipDetailsFallback(details), convertToPSTTimestamp, getPSTTimestamp);
      if (!Array.isArray(arr)) return [];
      return arr.map((s, i) => {
        const id = parseInt(s?.id, 10) || (i + 1);
        const icon = formatShipIconFilename(id);
        const artwork = shipArtworkUrl({ id });
        const effect = String(s?.effect || "");
        const special = String(s?.special || "");
        return {
          idx: id,
          id,
          name: String(s?.name || `Ship ${i + 1}`),
          thumb: icon,
          icon,
          artwork,
          description: effect,
          effect,
          hasSpecial: String(s?.hasSpecial || "no"),
          special,
          colaCount: Number.isFinite(Number(s?.colaCount)) ? Number(s.colaCount) : null,
          superColaCount: Number.isFinite(Number(s?.superColaCount)) ? Number(s.superColaCount) : null
        };
      });
    } catch (e) { console.warn("[ships] units parse failed", e); return []; }
  }
  async function fetchShipsList() {
    const [unitsRes, detailsRes] = await Promise.all([
      fetch(SHIPS_DATA_URL),
      fetch(SHIPS_DETAILS_URL)
    ]);
    const [unitsText, detailsText] = await Promise.all([
      unitsRes.text(),
      detailsRes.ok ? detailsRes.text() : Promise.resolve("")
    ]);
    return parseShipUnitsSource(unitsText, parseShipsDetailsSource(detailsText));
  }
  async function loadShips() {
    if (shipsLoaded) return shipsList;
    if (shipsLoadingPromise) return shipsLoadingPromise;
    shipsLoadingPromise = (async () => {
      try {
        const raw = localStorage.getItem(SHIPS_DATA_CACHE_KEY);
        if (raw) {
          const cached = JSON.parse(raw);
          if (cached && Array.isArray(cached.list) && (Date.now() - (cached.t || 0) < SHIPS_DATA_TTL_MS)) {
            shipsList = cached.list;
            shipsLoaded = true;
            fetchShipsList().then((fresh) => {
              if (fresh.length) {
                shipsList = fresh;
                try { localStorage.setItem(SHIPS_DATA_CACHE_KEY, JSON.stringify({ t: Date.now(), list: fresh })); } catch {}
              }
            }).catch(() => {});
            return shipsList;
          }
        }
      } catch {}
      try {
        const list = await fetchShipsList();
        shipsList = list;
        shipsLoaded = true;
        try { localStorage.setItem(SHIPS_DATA_CACHE_KEY, JSON.stringify({ t: Date.now(), list })); } catch {}
      } catch (e) {
        console.warn("[ships] load failed", e);
        shipsList = [];
        shipsLoaded = true;
      }
      return shipsList;
    })();
    return shipsLoadingPromise;
  }
  function shipThumbUrl(thumb) {
    const filename = shipIconFilename(thumb);
    return filename ? `${SHIPS_THUMB_BASE}/${encodeURIComponent(filename)}` : PLACEHOLDER_IMG;
  }
  function shipArtworkUrl(ship) {
    const id = parseInt(ship?.id || ship?.idx, 10) || 0;
    const filename = formatShipArtworkFilename(id);
    return filename ? `${SHIPS_ART_BASE}/${encodeURIComponent(filename)}` : "";
  }

  // State
  let characters = [];
  let allUnitsById = new Map();
  let bannerOrder = [];
  let bannerIndexMap = new Map();
  let openBannerSet = new Set();
  let charactersLoaded = false;
  let charactersLoading = null;
  const imageCache = new Map();
  const shipIconNormalizeCache = new Map();
  const failedImageSet = new Set();
  const decodedImageSet = new Set();
  const artworkWarmQueued = new Set();
  const artworkWarmInFlight = new Set();
  const artworkWarmQueue = [];
  const MAX_ARTWORK_WARM_CONCURRENCY = 2;
  const ENABLE_IDLE_ARTWORK_WARMUP = false;
  const SORT_KEY = "boxSort";
  const CATALOG_REPEAT_KEY = "catalogRepeatSelected";
  const CATALOG_OWNERSHIP_MODES = new Set(["all", "owned", "missing"]);
  const EDIT_LEVEL_TOOL_KEY = "boxEditLevelValue";
  const EDIT_CC_TOOL_KEY = "boxEditCottonCandyValue";
  const EDIT_LB_TOOL_KEY = "boxEditLimitBreakChoice";
  const EDIT_RAINBOW_TOOL_KEY = "boxEditRainbowChoice";
  const EDIT_APPLY_LEVEL_KEY = "boxEditApplyLevel";
  const EDIT_APPLY_CC_KEY = "boxEditApplyCottonCandy";
  const EDIT_APPLY_LB_KEY = "boxEditApplyLimitBreak";
  const EDIT_APPLY_RB_KEY = "boxEditApplyRainbow";
  const LIMIT_BREAK_BADGE_SRC = {
    1: "assets/modal/limitbreak_max.png",
    2: "assets/modal/limitbreak_super_max.png"
  };
  let sortOrder = localStorage.getItem("boxSortOrder") || "desc";
  let activeCatalogPage = localStorage.getItem("catalogPage") || "sugo";
  let catalogOwnershipMode = (() => {
    const raw = String(localStorage.getItem(CATALOG_REPEAT_KEY) || "").toLowerCase();
    if (CATALOG_OWNERSHIP_MODES.has(raw)) return raw;
    return "all";
  })();
  let sugoRepresentatives = [];
  let sugoFamilyIdSet = new Set();
  let legendBaseIdSet = new Set();
  let rootComponentMap = new Map();
  let componentRootIdsMap = new Map();
  let legendComponentSet = new Set();
  let pkaRootSet = new Set();
  let pkaComponentSet = new Set();
  let storyComponentSet = new Set();
  let coopComponentSet = new Set();
  let raidComponentSet = new Set();
  let coliseumComponentSet = new Set();
  let arenaComponentSet = new Set();
  let ambushComponentSet = new Set();
  let tmComponentSet = new Set();
  let kizunaComponentSet = new Set();
  let fortnightComponentSet = new Set();
  let rookieComponentSet = new Set();
  let rumbleComponentSet = new Set();
  const TYPE_SORT_RANK = {
    vs: 0,
    dual: 1,
    str: 2,
    dex: 3,
    qck: 4,
    psy: 5,
    int: 6
  };

  // ===== Type filter (multi-select) =====
  const TYPE_FILTER_KEY = "boxTypeFilter";
  const VALID_TYPE_FILTERS = ["str", "dex", "qck", "psy", "int", "dual", "vs"];
  function readTypeFilter() {
    try {
      const raw = localStorage.getItem(TYPE_FILTER_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(parsed)) return new Set();
      return new Set(parsed.filter((t) => VALID_TYPE_FILTERS.includes(String(t).toLowerCase())));
    } catch { return new Set(); }
  }
  let selectedTypeFilters = readTypeFilter();
  function persistTypeFilter() {
    localStorage.setItem(TYPE_FILTER_KEY, JSON.stringify(Array.from(selectedTypeFilters)));
  }
  function getCharTypeKey(char) {
    if (isVsCharacterForTypeSort(char)) return "vs";
    if (isDualCharacterForTypeSort(char)) return "dual";
    return String(char?.type || "").toLowerCase();
  }
  function passesTypeFilter(char) {
    if (!selectedTypeFilters.size) return true;
    return selectedTypeFilters.has(getCharTypeKey(char));
  }

  function normalizeSortKey(value) {
    const raw = String(value || "").toLowerCase();
    if (raw === "added") return "type";
    if (raw === "id" || raw === "name" || raw === "type") return raw;
    return "id";
  }

  function getCurrentSortKey() {
    return normalizeSortKey(localStorage.getItem(SORT_KEY));
  }

  function isVsCharacterForTypeSort(char) {
    const name = String(char?.name || "");
    if (!/\bvs\b/i.test(name)) return false;
    const root = getIdRoot(char?.id);
    if (!/^\d+$/.test(root)) return false;
    return allUnitsById.has(`${root}-1`) && allUnitsById.has(`${root}-2`);
  }

  function isDualCharacterForTypeSort(char) {
    const name = String(char?.name || "");
    if (/\bvs\b/i.test(name)) return false;
    const root = getIdRoot(char?.id);
    if (!/^\d+$/.test(root)) return false;
    return allUnitsById.has(`${root}-1`) && allUnitsById.has(`${root}-2`);
  }

  function getTypeSortRank(char) {
    if (isVsCharacterForTypeSort(char)) return TYPE_SORT_RANK.vs;
    if (isDualCharacterForTypeSort(char)) return TYPE_SORT_RANK.dual;
    const key = String(char?.type || "").toLowerCase();
    return TYPE_SORT_RANK[key] ?? Number.MAX_SAFE_INTEGER;
  }

  // Local storage (owned)
  const STORAGE_KEY = "boxManager";
  const UNIT_STATE_KEY = "boxManagerUnitState";
  const BOX_SCHEMA_KEY = "boxManagerSchema";
  const BOX_SCHEMA_VERSION = "2";
  const ISLAND_KEY = "boxIslandLevels";
  const BACKUP_VERSION = 1;
  const BACKUP_APP_ID = "optc-sugo-manager";
  function readBox() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch { return []; }
  }
  function persistBox() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(savedBox));
  }
  let savedBox = readBox();
  function readUnitStateMap() {
    try {
      const raw = localStorage.getItem(UNIT_STATE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  let unitStateMap = readUnitStateMap();
  function persistUnitStateMap() {
    localStorage.setItem(UNIT_STATE_KEY, JSON.stringify(unitStateMap));
  }

  function migrateOwnedStateIfNeeded() {
    const currentSchema = localStorage.getItem(BOX_SCHEMA_KEY);
    if (currentSchema === BOX_SCHEMA_VERSION) return;
    // Reset ownership/state once for the new catalog behavior baseline.
    savedBox = [];
    unitStateMap = {};
    persistBox();
    persistUnitStateMap();
    localStorage.setItem(BOX_SCHEMA_KEY, BOX_SCHEMA_VERSION);
  }
  migrateOwnedStateIfNeeded();

  const isSelected = (uid) => savedBox.includes(String(uid));
  const addSelection = (uid) => {
    const id = String(uid);
    if (!isSelected(id)) {
      savedBox.push(id);
      persistBox();
    }
  };
  const removeSelection = (uid) => {
    const id = String(uid);
    if (isSelected(id)) {
      savedBox = savedBox.filter((x) => x !== id);
      persistBox();
    }
  };
  const toggleSelection = (uid) => (isSelected(uid) ? removeSelection(uid) : addSelection(uid));

  function getUnitStateEntry(uid) {
    const id = String(uid || "");
    if (!id) return null;
    const existing = unitStateMap[id];
    if (existing && typeof existing === "object" && !Array.isArray(existing)) return existing;
    const created = {};
    unitStateMap[id] = created;
    return created;
  }

  function getCottonCandyValue(uid) {
    const id = String(uid || "");
    if (!id) return 0;
    const entry = unitStateMap[id];
    if (!entry || typeof entry !== "object") return 0;
    if (entry.cottonCandy != null) return clampInt(entry.cottonCandy, 0, 600);
    const legacy = Number(entry.ccHp || 0) + Number(entry.ccAtk || 0) + Number(entry.ccRcv || 0);
    return clampInt(legacy, 0, 600);
  }

  function getLevelValue(uid) {
    const id = String(uid || "");
    if (!id) return 0;
    const entry = unitStateMap[id];
    if (!entry || typeof entry !== "object") return 0;
    return clampInt(entry.level ?? 0, 0, 150);
  }

  function setCottonCandyValue(uid, value) {
    const entry = getUnitStateEntry(uid);
    if (!entry) return false;
    const next = clampInt(value, 0, 600);
    if (entry.cottonCandy != null && clampInt(entry.cottonCandy, 0, 600) === next) return false;
    entry.cottonCandy = next;
    persistUnitStateMap();
    return true;
  }

  function getRequiredLlbLevelForLevel(level) {
    const lv = clampInt(level, 0, 150);
    if (lv >= 150) return 5;
    if (lv >= 130) return 4;
    if (lv >= 120) return 3;
    if (lv >= 110) return 2;
    if (lv >= 105) return 1;
    return 0;
  }

  function setLevelValue(uid, value) {
    const entry = getUnitStateEntry(uid);
    if (!entry) return false;
    const next = clampInt(value, 0, 150);
    let changed = false;

    if (next <= 0) {
      if (entry.level != null) {
        delete entry.level;
        changed = true;
      }
    } else {
      const current = entry.level == null ? null : clampInt(entry.level, 0, 150);
      if (current !== next) {
        entry.level = next;
        changed = true;
      }
      const requiredLlbLevel = getRequiredLlbLevelForLevel(next);
      const currentLlbLevel = clampInt(entry.llbLevel ?? 0, 0, 5);
      if (currentLlbLevel < requiredLlbLevel) {
        entry.llbLevel = requiredLlbLevel;
        changed = true;
      }
    }

    if (!changed) return false;
    persistUnitStateMap();
    return true;
  }

  function getLimitBreakBadgeValue(uid) {
    const id = String(uid || "");
    if (!id) return 0;
    const entry = unitStateMap[id];
    if (!entry || typeof entry !== "object") return 0;
    return clampInt(entry.limitBreakBadge ?? 0, 0, 2);
  }

  function setLimitBreakBadgeValue(uid, value) {
    const entry = getUnitStateEntry(uid);
    if (!entry) return false;
    const next = clampInt(value, 0, 2);
    const prev = getLimitBreakBadgeValue(uid);
    if (prev === next && ((next === 0 && entry.limitBreakBadge == null) || Number(entry.limitBreakBadge) === next)) {
      return false;
    }
    if (next <= 0) {
      delete entry.limitBreakBadge;
    } else {
      entry.limitBreakBadge = next;
    }
    persistUnitStateMap();
    return true;
  }

  function getRainbowFrameValue(uid) {
    const id = String(uid || "");
    if (!id) return 0;
    const entry = unitStateMap[id];
    if (!entry || typeof entry !== "object") return 0;
    return clampInt(entry.rainbowFrame ?? 0, 0, 2);
  }

  function setRainbowFrameValue(uid, value) {
    const entry = getUnitStateEntry(uid);
    if (!entry) return false;
    const next = clampInt(value, 0, 2);
    const prev = getRainbowFrameValue(uid);
    let changed = false;

    if (!(prev === next && ((next === 0 && entry.rainbowFrame == null) || Number(entry.rainbowFrame) === next))) {
      if (next <= 0) {
        delete entry.rainbowFrame;
      } else {
        entry.rainbowFrame = next;
      }
      changed = true;
    }

    if (next > 0) {
      const requiredLimitBreakBadge = next === 2 ? 2 : 1;
      const currentLimitBreakBadge = clampInt(entry.limitBreakBadge ?? 0, 0, 2);
      if (currentLimitBreakBadge < requiredLimitBreakBadge) {
        entry.limitBreakBadge = requiredLimitBreakBadge;
        changed = true;
      }
    }

    if (!changed) return false;
    persistUnitStateMap();
    return true;
  }

  // Image helper
  function loadImageDecoded(url) {
    if (!url) return Promise.reject(new Error("No URL"));
    if (imageCache.has(url)) return imageCache.get(url);
    const p = new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = "async";
      img.onload = async () => {
        try { if (img.decode) await img.decode(); } catch {}
        failedImageSet.delete(url);
        decodedImageSet.add(url);
        resolve(url);
      };
      img.onerror = (err) => {
        imageCache.delete(url);
        failedImageSet.add(url);
        reject(err);
      };
      img.src = url;
    });
    imageCache.set(url, p);
    return p;
  }

  function orderImageSources(primary, secondary) {
    const p1 = primary || secondary || PLACEHOLDER_IMG;
    const p2 = secondary || PLACEHOLDER_IMG;
    if (failedImageSet.has(p1) && !failedImageSet.has(p2)) {
      return { primary: p2, secondary: p1 };
    }
    return { primary: p1, secondary: p2 };
  }

  function setImgSrcIfChanged(img, src) {
    if (!img || !src) return;
    const current = img.getAttribute("src") || "";
    if (current === src) return;
    img.src = src;
  }

  function pumpArtworkWarmQueue() {
    while (artworkWarmInFlight.size < MAX_ARTWORK_WARM_CONCURRENCY && artworkWarmQueue.length) {
      const url = artworkWarmQueue.shift();
      if (!url || artworkWarmInFlight.has(url)) continue;
      artworkWarmInFlight.add(url);
      loadImageDecoded(url)
        .catch(() => null)
        .finally(() => {
          artworkWarmInFlight.delete(url);
          pumpArtworkWarmQueue();
        });
    }
  }

  function queueArtworkWarm(url) {
    if (!url || decodedImageSet.has(url) || artworkWarmQueued.has(url) || artworkWarmInFlight.has(url)) return;
    artworkWarmQueued.add(url);
    artworkWarmQueue.push(url);
    pumpArtworkWarmQueue();
  }

  function scheduleIdleArtworkWarmup(list, limit = 80) {
    if (!ENABLE_IDLE_ARTWORK_WARMUP) return;
    if (!Array.isArray(list) || !list.length) return;
    const urls = [];
    list.slice(0, limit).forEach((c) => {
      if (!c) return;
      if (Array.isArray(c.artworkSources)) {
        c.artworkSources.forEach((u) => u && urls.push(u));
      } else if (c.artwork) {
        urls.push(c.artwork);
      }
    });
    if (!urls.length) return;
    const run = () => urls.forEach((url) => queueArtworkWarm(url));
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(run, { timeout: 900 });
      return;
    }
    setTimeout(run, 220);
  }

  function setImgWithFallback(img, primary, secondary) {
    if (!img) return;
    img.decoding = "async";
    const token = String(Date.now() + Math.random());
    img.dataset.loadToken = token;
    const applySrc = (src) => {
      if (img.dataset.loadToken !== token) return;
      setImgSrcIfChanged(img, src || PLACEHOLDER_IMG);
    };
    const ordered = orderImageSources(primary, secondary);
    const sources = [ordered.primary, ordered.secondary].filter((u, i, a) => u && a.indexOf(u) === i);
    if (!sources.length) { applySrc(PLACEHOLDER_IMG); return; }

    // Cache hit: instantané
    const cached = sources.find((u) => decodedImageSet.has(u));
    if (cached) { applySrc(cached); return; }

    const hasStableSrc = !!img.getAttribute("src") && img.getAttribute("src") !== TRANSPARENT_PX;
    if (!hasStableSrc) {
      setImgSrcIfChanged(img, PLACEHOLDER_IMG);
    }

    // Race en parallèle: la première source décodée gagne.
    let settled = false;
    let remaining = sources.length;
    sources.forEach((url) => {
      loadImageDecoded(url)
        .then(() => {
          if (settled) return;
          settled = true;
          applySrc(url);
        })
        .catch(() => {
          remaining -= 1;
          if (!settled && remaining === 0) applySrc(PLACEHOLDER_IMG);
        });
    });
  }

  function loadNormalizedShipIcon(url) {
    if (!url || url === PLACEHOLDER_IMG || url.startsWith("data:")) return Promise.resolve(url || PLACEHOLDER_IMG);
    if (shipIconNormalizeCache.has(url)) return shipIconNormalizeCache.get(url);
    const p = new Promise((resolve, reject) => {
      const source = new Image();
      source.crossOrigin = "anonymous";
      source.decoding = "async";
      source.onload = () => {
        try {
          const w = source.naturalWidth || source.width;
          const h = source.naturalHeight || source.height;
          if (!w || !h) { resolve(url); return; }

          const scan = document.createElement("canvas");
          scan.width = w;
          scan.height = h;
          const scanCtx = scan.getContext("2d", { willReadFrequently: true });
          if (!scanCtx) { resolve(url); return; }
          scanCtx.drawImage(source, 0, 0);
          const pixels = scanCtx.getImageData(0, 0, w, h).data;
          let minX = w;
          let minY = h;
          let maxX = -1;
          let maxY = -1;
          for (let y = 0; y < h; y += 1) {
            for (let x = 0; x < w; x += 1) {
              const alpha = pixels[((y * w + x) * 4) + 3];
              if (alpha <= 8) continue;
              if (x < minX) minX = x;
              if (y < minY) minY = y;
              if (x > maxX) maxX = x;
              if (y > maxY) maxY = y;
            }
          }
          if (maxX < minX || maxY < minY) { resolve(url); return; }

          const canvasSize = 160;
          const padding = 10;
          const cropW = maxX - minX + 1;
          const cropH = maxY - minY + 1;
          const scale = Math.min((canvasSize - padding * 2) / cropW, (canvasSize - padding * 2) / cropH);
          const drawW = Math.round(cropW * scale);
          const drawH = Math.round(cropH * scale);
          const out = document.createElement("canvas");
          out.width = canvasSize;
          out.height = canvasSize;
          const outCtx = out.getContext("2d");
          if (!outCtx) { resolve(url); return; }
          outCtx.imageSmoothingEnabled = true;
          outCtx.imageSmoothingQuality = "high";
          outCtx.drawImage(
            source,
            minX,
            minY,
            cropW,
            cropH,
            Math.round((canvasSize - drawW) / 2),
            Math.round((canvasSize - drawH) / 2),
            drawW,
            drawH
          );
          resolve(out.toDataURL("image/png"));
        } catch {
          resolve(url);
        }
      };
      source.onerror = reject;
      source.src = url;
    }).catch((err) => {
      shipIconNormalizeCache.delete(url);
      throw err;
    });
    shipIconNormalizeCache.set(url, p);
    return p;
  }

  function setShipImgWithFallback(img, primary, secondary) {
    if (!img) return;
    img.decoding = "async";
    const token = String(Date.now() + Math.random());
    img.dataset.loadToken = token;
    const applySrc = (src) => {
      if (img.dataset.loadToken !== token) return;
      setImgSrcIfChanged(img, src || PLACEHOLDER_IMG);
    };
    const ordered = orderImageSources(primary, secondary);
    const sources = [ordered.primary, ordered.secondary].filter((u, i, a) => u && a.indexOf(u) === i);
    if (!sources.length) { applySrc(PLACEHOLDER_IMG); return; }

    const hasStableSrc = !!img.getAttribute("src") && img.getAttribute("src") !== TRANSPARENT_PX;
    if (!hasStableSrc) {
      setImgSrcIfChanged(img, PLACEHOLDER_IMG);
    }

    let settled = false;
    let remaining = sources.length;
    sources.forEach((url) => {
      loadNormalizedShipIcon(url)
        .then((normalizedUrl) => {
          if (settled) return;
          settled = true;
          decodedImageSet.add(url);
          failedImageSet.delete(url);
          applySrc(normalizedUrl || url);
        })
        .catch(() => {
          failedImageSet.add(url);
          remaining -= 1;
          if (!settled && remaining === 0) applySrc(PLACEHOLDER_IMG);
        });
    });
  }

  function thumbUrl(id, base = THUMB_PRIMARY) {
    const id4 = String(id).padStart(4, "0");
    return `${base}/${id4[0]}/${id4[1]}00/${id4}.png`;
  }
  function artUrl(id) {
    const id4 = String(id).padStart(4, "0");
    return `${ART_BASE}/${id4[0]}/${id4[1]}00/${id4}.png`;
  }
  function getArtSources(id) {
    const id4 = String(id).padStart(4, "0");
    const tail = `${id4[0]}/${id4[1]}00/${id4}.png`;
    return [
      `${ART_BASE}/${tail}`,
      `${ART_BASE_NOREF}/${tail}`,
      `${ART_BASE_RAW}/${tail}`
    ];
  }

  function getThumbSources(id) {
    const key = String(id || "");
    const thumbKey = THUMB_ID_OVERRIDES.get(key) || key;
    if (THUMB_JAP_PRIMARY_IDS.has(thumbKey)) {
      return {
        primary: thumbUrl(thumbKey, THUMB_FALLBACK),
        fallback: thumbUrl(thumbKey, THUMB_PRIMARY)
      };
    }
    return {
      primary: thumbUrl(thumbKey, THUMB_PRIMARY),
      fallback: thumbUrl(thumbKey, THUMB_FALLBACK)
    };
  }

  const searchInput = document.getElementById("search-input");
  const clearSearchBtn = document.getElementById("clear-search");
  const progressFill = document.getElementById("progress-fill");
  const progressLabel = document.getElementById("progress-label");
  const characterList = document.getElementById("character-list");
  const tabSugo = document.getElementById("tab-sugo");
  const tabRR = document.getElementById("tab-rr");
  const tabF2P = document.getElementById("tab-f2p");
  const tabArchive = document.getElementById("tab-archive");
  const catalogOwnershipToggle = document.getElementById("catalog-ownership-toggle");
  const catalogOwnershipButtons = Array.from(document.querySelectorAll(".catalog-ownership-btn"));
  const catalogTabs = [tabSugo, tabRR, tabF2P, tabArchive].filter(Boolean);

  const selectionToggleBtn = document.getElementById("selection-toggle");
  const editPanel = document.getElementById("edit-panel");
  const editCloseBtn = document.getElementById("edit-close");
  const editLevelSlider = document.getElementById("edit-level-slider");
  const editLevelValue = document.getElementById("edit-level-value");
  const editLevelStepButtons = Array.from(document.querySelectorAll(".edit-level-step"));
  const editCCSlider = document.getElementById("edit-cc-slider");
  const editCCValue = document.getElementById("edit-cc-value");
  const editCCStepButtons = Array.from(document.querySelectorAll(".edit-cc-step"));
  const editLBOptions = Array.from(document.querySelectorAll(".edit-lb-option"));
  const editRBOptions = Array.from(document.querySelectorAll(".edit-rb-option"));
  const editApplyBtn = document.getElementById("edit-apply");
  const editClearBtn = document.getElementById("edit-clear");
  const editDeactivateBtn = document.getElementById("edit-deactivate");
  const editModeStatus = document.getElementById("edit-mode-status");
  const editActionSummary = document.getElementById("edit-action-summary");
  const editLevelBlock = document.getElementById("edit-level-block");
  const editCCBlock = document.getElementById("edit-cc-block");
  const editLBBlock = document.getElementById("edit-lb-block");
  const editRBBlock = document.getElementById("edit-rb-block");
  const editEnableLevel = document.getElementById("edit-enable-level");
  const editEnableCC = document.getElementById("edit-enable-cc");
  const editEnableLB = document.getElementById("edit-enable-lb");
  const editEnableRB = document.getElementById("edit-enable-rb");


  const settingsToggle = document.getElementById("settings-toggle");
  const settingsPanel = document.getElementById("settings-panel");
  const spClose = document.getElementById("sp-close");
  const spCloseBtn = document.getElementById("sp-close-btn");
  const settingsExportBtn = document.getElementById("settings-export");
  const settingsImportBtn = document.getElementById("settings-import");
  const settingsResetBtn = document.getElementById("settings-reset");
  const exportBtn = document.getElementById("export-btn");
  const importInput = document.getElementById("import-input");
  const settingsResetDialog = document.getElementById("settings-reset-dialog");
  const settingsResetUnits = document.getElementById("settings-reset-units");
  const settingsResetIsland = document.getElementById("settings-reset-island");
  const settingsResetAll = document.getElementById("settings-reset-all");
  const settingsResetShips = document.getElementById("settings-reset-ships");
  const settingsResetApply = document.getElementById("settings-reset-apply");
  const settingsResetCancel = document.getElementById("settings-reset-cancel");
  const themeToggle = document.getElementById("theme-toggle");
  const themeLabel = document.getElementById("theme-label");


  const sortToggle = document.getElementById("sort-toggle");
  const sortMenu = document.getElementById("sort-menu");

  const islandToggle = document.getElementById("collector-island-toggle");
  const islandPanel = document.getElementById("island-panel");
  const islandClose = document.getElementById("island-close");
  const islandGrid = document.getElementById("island-grid");
  const islandContent = islandPanel?.querySelector(".island-content");
  const islandInfoBtn = document.getElementById("island-info");
  const islandCalcBtn = document.getElementById("island-calc");
  const islandMaxPanel = document.getElementById("island-max-panel");
  const islandMaxList = document.getElementById("island-max-list");
  const islandCalcPanel = document.getElementById("island-calc-panel");
  const islandCalcList = document.getElementById("island-calc-list");
  const islandCalcTotal = document.getElementById("island-calc-total");

  let lightboxEl = null;
  let lightboxImg = null;
  let lightboxThumbImg = null;
  let lightboxRequestToken = 0;
  const SPECIAL_ID_REPLACEMENTS = new Map();

  // Data helpers (banners + evolutions)
  const BANNER_DEFS = [
    { key: "superlrr", label: "Super Sugo" },
    { key: "annilrr", label: "Anniversary" },
    { key: "pflrr", label: "Pirate Rumble" },
    { key: "tmlrr", label: "Treasure Map" },
    { key: "kclrr", label: "Kizuna Clash" },
    { key: "shop", label: "Exchange" },
    { key: "rro", label: "Sugo" },
    { key: "special", label: "Special" }
  ];
  const BANNER_OVERRIDES = {
    "3969": "Sugo",
    "3739": "Sugo",
    "4987": "Special",
    "5014": "Special"
  };

  const PAGE_BANNER_ORDER = {
    sugo: ["Super Sugo", "Anniversary", "Pirate Rumble", "Treasure Map", "Kizuna Clash", "Exchange", "Sugo", "Special"],
    rr: ["Limited", "Promo", "Login Bonus", "Shop", "Pirate Rumble", "Treasure Map", "Kizuna Clash", "Support"],
    f2p: ["Story", "PKA", "Co-op", "Raid", "Colosseum", "Arena", "Ambush", "Treasure Map", "Kizuna Clash", "Fortnight", "Rookie", "Pirate Rumble", "Other"],
    archive: ["Character Log"]
  };
  // Optional manual overrides for PKA IDs if needed.
  const PKA_UNIT_IDS_MANUAL = new Set([]);
  const STORY_UNIT_IDS_MANUAL = new Set(["27", "32", "34", "36", "37", "40", "41", "42", "48", "50", "51", "52", "54", "56", "59", "60", "61", "62", "64", "68", "73", "200", "204", "206", "212", "215", "228", "229", "230", "234", "236", "290", "291", "293", "294", "295", "318", "322", "329", "332", "333", "335", "337", "341", "378", "380", "381", "382", "386", "396", "398", "400", "402", "405", "426", "427", "428", "429", "431", "432", "462", "463", "464", "465", "466", "467", "541", "542", "544", "546", "550", "563", "564", "565", "566", "567", "614", "615", "1387", "1388", "1389", "1397", "1446", "1447", "1448", "2052", "2124", "2125", "2128", "2130", "2230", "2317", "2318", "2319", "2595", "2596", "2598", "2599", "3002", "3003", "3091", "3092", "3093", "3194", "3196"]);
  const TREASURE_MAP_UNIT_IDS_MANUAL = new Set(["2439", "2632", "2661", "2880", "3444", "4364"]);
  const KIZUNA_UNIT_IDS_MANUAL = new Set(["3620", "3903"]);
  const FORTNIGHT_UNIT_IDS_MANUAL = new Set(["47", "338", "339", "419", "421", "422", "433", "434", "441", "442", "443", "460", "511", "572", "573", "581", "582", "584", "601", "608", "609", "636", "637", "657", "658", "666", "667", "690", "714", "716", "722", "741", "762", "763", "764", "765", "767", "768", "769", "798", "800", "810", "811", "849", "850", "853", "854", "867", "868", "886", "887", "898", "899", "920", "930", "947", "948", "949", "980", "981", "1004", "1006", "1012", "1013", "1014", "1039", "1051", "1052", "1070", "1073", "1097", "1098", "1110", "1113", "1136", "1138", "1139", "1169", "1171", "1205", "1206", "1216", "1217", "1218", "1244", "1255", "1256", "1289", "1290", "1302", "1329", "1330", "1333", "1334", "1359", "1386", "1427", "1452", "1470", "1471", "1510", "1511", "1512", "1521", "1522", "1548", "1566", "1582", "1598", "1599", "1607", "1608", "1625", "1626", "1650", "1671", "1672", "1691", "1692", "1725", "1767", "1768", "1776", "1819", "1820", "1844", "1857", "1865", "1893", "1920", "1931", "1932", "1949", "1966", "1980", "1995", "2045", "2046", "2057", "2058", "2088", "2089", "2090", "2091", "2093", "2094", "2095", "2144", "2167", "2178", "2179", "2220", "2221", "2254", "2255", "2278", "2279", "2328", "2350", "2352", "2378", "2379", "2429", "2458", "2459", "2492", "2493", "2520", "2521", "2522", "2523", "2525", "2526", "2527", "2572", "2573", "2634", "2636", "2637", "2638", "2639", "2640", "2641", "2666", "2693", "2694", "2724", "2752", "2753", "2783", "2975", "2976", "3086", "3286", "3287", "3305", "3477", "3795"]);
  const ROOKIE_UNIT_IDS_MANUAL = new Set(["1564"]);
  const COLISEUM_UNIT_IDS_MANUAL = new Set(["1460", "2513", "2530"]);
  const PKA_EXCLUDED_TO_OTHER = new Set(["403", "419", "513", "746"]);
  const RAID_EXCLUDED_TO_OTHER = new Set(["1", "215", "217", "223", "293", "294", "295", "379", "380", "429", "519", "520", "527", "528", "553", "554", "555", "556", "557", "558", "708", "709", "773", "774", "775", "799", "986", "987", "988", "1115", "1175", "1177", "1208", "1210", "1387", "1388", "1389", "1446", "1447", "1549", "2396", "2397", "2662"]);
  const KIZUNA_EXCLUDED_TO_OTHER = new Set(["4130"]);
  const COLISEUM_EXCLUDED_TO_OTHER = new Set(["1459"]);
  const STORY_EXCLUDED_TO_OTHER = new Set(["2780"]);
  const FORTNIGHT_EXCLUDED_TO_STORY = new Set(["318", "322", "337", "341", "386", "405", "550", "1397", "1564"]);
  const OTHER_REMOVED_ROOT_IDS = new Set(["269", "270", "271", "272", "273", "274", "275", "276", "277", "278", "279", "280", "281", "282", "283", "284", "285", "286", "287", "288"]);
  const RR_PROMO_FORCED_ROOT_IDS = new Set([]);
  const RR_LOGIN_BONUS_FORCED_ROOT_IDS = new Set([]);
  const RR_SHOP_FORCED_ROOT_IDS = new Set(["403", "746"]);
  let PKA_UNIT_IDS = new Set();
  let STORY_UNIT_IDS = new Set();
  let COOP_UNIT_IDS = new Set();
  let RAID_UNIT_IDS = new Set();
  let COLISEUM_UNIT_IDS = new Set();
  let ARENA_UNIT_IDS = new Set();
  let AMBUSH_UNIT_IDS = new Set();
  let TREASURE_MAP_UNIT_IDS = new Set();
  let KIZUNA_UNIT_IDS = new Set();
  let FORTNIGHT_UNIT_IDS = new Set();
  let ROOKIE_UNIT_IDS = new Set();
  let PIRATE_RUMBLE_UNIT_IDS = new Set();
  let BOOSTER_EVOLVER_UNIT_IDS = new Set();
  const SUGO_BANNER_FLAG_ORDER = [
    { key: "superlrr", label: "Super Sugo" },
    { key: "annilrr", label: "Anniversary" },
    { key: "pflrr", label: "Pirate Rumble" },
    { key: "tmlrr", label: "Treasure Map" },
    { key: "kclrr", label: "Kizuna Clash" },
    { key: "shop", label: "Exchange" },
    { key: "rro", label: "Sugo" },
    { key: "special", label: "Special" }
  ];

  function hasFlag(entry, key) {
    return Number(entry?.[key] || 0) === 1;
  }

  function hasRecruitOrSugoFlag(entry) {
    const f = entry || {};
    return hasFlag(f, "rr")
      || hasFlag(f, "lrr")
      || hasFlag(f, "slrr")
      || hasFlag(f, "tmlrr")
      || hasFlag(f, "kclrr")
      || hasFlag(f, "pflrr")
      || hasFlag(f, "rro")
      || hasFlag(f, "superlrr")
      || hasFlag(f, "annilrr");
  }

  function getSugoBannerFromFlags(flagEntry) {
    const f = flagEntry || {};
    const hit = SUGO_BANNER_FLAG_ORDER.find((entry) => hasFlag(f, entry.key));
    return hit ? hit.label : "";
  }

  function isPkaUnitId(value) {
    const root = getIdRoot(value);
    return !!root && PKA_UNIT_IDS.has(root);
  }

  function isStoryUnitId(value) {
    const root = getIdRoot(value);
    return !!root && STORY_UNIT_IDS.has(root);
  }

  function isRaidUnitId(value) {
    const root = getIdRoot(value);
    return !!root && RAID_UNIT_IDS.has(root);
  }

  function isCoopUnitId(value) {
    const root = getIdRoot(value);
    return !!root && COOP_UNIT_IDS.has(root);
  }

  function isArenaUnitId(value) {
    const root = getIdRoot(value);
    return !!root && ARENA_UNIT_IDS.has(root);
  }

  function isAmbushUnitId(value) {
    const root = getIdRoot(value);
    return !!root && AMBUSH_UNIT_IDS.has(root);
  }

  function isTreasureMapUnitId(value) {
    const root = getIdRoot(value);
    return !!root && TREASURE_MAP_UNIT_IDS.has(root);
  }

  function isKizunaUnitId(value) {
    const root = getIdRoot(value);
    return !!root && KIZUNA_UNIT_IDS.has(root);
  }

  function isFortnightUnitId(value) {
    const root = getIdRoot(value);
    return !!root && FORTNIGHT_UNIT_IDS.has(root);
  }

  function isRookieMissionUnitId(value) {
    const root = getIdRoot(value);
    return !!root && ROOKIE_UNIT_IDS.has(root);
  }

  function isPirateRumbleUnitId(value) {
    const root = getIdRoot(value);
    return !!root && PIRATE_RUMBLE_UNIT_IDS.has(root);
  }

  function isBoosterEvolverUnitId(value) {
    const root = getIdRoot(value);
    return !!root && BOOSTER_EVOLVER_UNIT_IDS.has(root);
  }

  function isColiseumUnitId(value) {
    const root = getIdRoot(value);
    return !!root && COLISEUM_UNIT_IDS.has(root);
  }

  function deriveCatalogMeta(flagEntry, unit = null, unitId = "") {
    const f = flagEntry || {};
    const isLegend = isSixStar(unit);
    const sugoBanner = getSugoBannerFromFlags(f);
    if (isLegend) {
      if (sugoBanner) return { page: "sugo", banner: sugoBanner };
      return { page: "sugo", banner: "Sugo" };
    }

    if (hasRecruitOrSugoFlag(f)) {
      if (hasFlag(f, "tmlrr")) return { page: "rr", banner: "RR TM" };
      if (hasFlag(f, "kclrr")) return { page: "rr", banner: "RR Kizuna" };
      if (hasFlag(f, "pflrr")) return { page: "rr", banner: "RR PvP" };
      if (hasFlag(f, "slrr")) return { page: "rr", banner: "RR Support" };
      if (hasFlag(f, "lrr")) return { page: "rr", banner: "RR Limited" };
      return { page: "rr", banner: "RR" };
    }

    if (isPkaUnitId(unitId)) {
      return { page: "f2p", banner: "PKA" };
    }
    if (isCoopUnitId(unitId)) {
      return { page: "f2p", banner: "Co-op" };
    }
    if (isRaidUnitId(unitId)) {
      return { page: "f2p", banner: "Raid" };
    }
    if (isColiseumUnitId(unitId)) {
      return { page: "f2p", banner: "Colosseum" };
    }
    if (isArenaUnitId(unitId)) {
      return { page: "f2p", banner: "Arena" };
    }
    if (isAmbushUnitId(unitId)) {
      return { page: "f2p", banner: "Ambush" };
    }
    if (isTreasureMapUnitId(unitId)) {
      return { page: "f2p", banner: "Treasure Map" };
    }
    if (isKizunaUnitId(unitId)) {
      return { page: "f2p", banner: "Kizuna Clash" };
    }
    if (isFortnightUnitId(unitId)) {
      return { page: "f2p", banner: "Fortnight" };
    }
    if (isRookieMissionUnitId(unitId)) {
      return { page: "f2p", banner: "Rookie" };
    }
    if (isPirateRumbleUnitId(unitId)) {
      return { page: "f2p", banner: "Pirate Rumble" };
    }

    const isF2P = hasFlag(f, "special") || hasFlag(f, "shop") || hasFlag(f, "tmshop") || hasFlag(f, "promo");
    if (isF2P) {
      if (hasFlag(f, "promo")) return { page: "f2p", banner: "PKA" };
      return { page: "f2p", banner: "Other" };
    }

    return isStoryUnitId(unitId)
      ? { page: "f2p", banner: "Story" }
      : { page: "f2p", banner: "Other" };
  }

  function getPageFromBanner(banner, fallback = "f2p") {
    const b = String(banner || "").trim();
    if (PAGE_BANNER_ORDER.sugo.includes(b)) return "sugo";
    if (PAGE_BANNER_ORDER.rr.includes(b)) return "rr";
    if (PAGE_BANNER_ORDER.f2p.includes(b)) return "f2p";
    return fallback;
  }

  function getIdRoot(value) {
    const raw = String(value || "").trim();
    const match = raw.match(/^(\d+)/);
    return match ? match[1] : raw;
  }

  function getFamilyId(char) {
    const base = String(char?.baseSixId || "").trim();
    const id = String(char?.id || "").trim();
    return getIdRoot(base || id);
  }

  function pickBestSugoRepresentative(list) {
    if (!Array.isArray(list) || !list.length) return null;
    const sorted = [...list].sort((a, b) => {
      const aId = String(a?.id || "");
      const bId = String(b?.id || "");
      const aNoVariant = aId.includes("-") ? 0 : 1;
      const bNoVariant = bId.includes("-") ? 0 : 1;
      if (aNoVariant !== bNoVariant) return bNoVariant - aNoVariant;

      const aFinal = a?.isFinalEvo ? 1 : 0;
      const bFinal = b?.isFinalEvo ? 1 : 0;
      if (aFinal !== bFinal) return bFinal - aFinal;
      const aPlus = a?.isSixPlus ? 1 : 0;
      const bPlus = b?.isSixPlus ? 1 : 0;
      if (aPlus !== bPlus) return bPlus - aPlus;
      const aLvl = Number(a?.maxLevel || 0);
      const bLvl = Number(b?.maxLevel || 0);
      if (aLvl !== bLvl) return bLvl - aLvl;
      return Number(b?.id || 0) - Number(a?.id || 0);
    });
    return sorted[0] || null;
  }

  function rebuildSugoCatalogCache() {
    const list = Array.isArray(characters) ? characters : [];
    const roots = new Set();
    const parentPairs = [];
    list.forEach((char) => {
      const r = getIdRoot(char?.id);
      const p = getIdRoot(char?.parentId);
      if (r) roots.add(r);
      if (p) roots.add(p);
      if (r && p) parentPairs.push([r, p]);
    });
    const parent = new Map();
    const rank = new Map();
    const find = (x) => {
      if (!parent.has(x)) {
        parent.set(x, x);
        rank.set(x, 0);
        return x;
      }
      const px = parent.get(x);
      if (px === x) return x;
      const root = find(px);
      parent.set(x, root);
      return root;
    };
    const union = (a, b) => {
      const ra = find(a);
      const rb = find(b);
      if (ra === rb) return;
      const rka = rank.get(ra) || 0;
      const rkb = rank.get(rb) || 0;
      if (rka < rkb) parent.set(ra, rb);
      else if (rka > rkb) parent.set(rb, ra);
      else {
        parent.set(rb, ra);
        rank.set(ra, rka + 1);
      }
    };
    roots.forEach((r) => find(r));
    parentPairs.forEach(([a, b]) => union(a, b));

    rootComponentMap = new Map();
    roots.forEach((r) => rootComponentMap.set(r, find(r)));
    componentRootIdsMap = new Map();
    roots.forEach((r) => {
      const comp = rootComponentMap.get(r) || r;
      if (!componentRootIdsMap.has(comp)) componentRootIdsMap.set(comp, new Set());
      componentRootIdsMap.get(comp).add(r);
    });

    pkaRootSet = new Set();
    (PKA_UNIT_IDS || []).forEach((id) => {
      const root = getIdRoot(id);
      if (root) pkaRootSet.add(root);
    });
    pkaComponentSet = rootsToComponents(pkaRootSet);
    storyComponentSet = rootsToComponents(STORY_UNIT_IDS);
    coopComponentSet = rootsToComponents(COOP_UNIT_IDS);
    raidComponentSet = rootsToComponents(RAID_UNIT_IDS);
    coliseumComponentSet = rootsToComponents(COLISEUM_UNIT_IDS);
    arenaComponentSet = rootsToComponents(ARENA_UNIT_IDS);
    ambushComponentSet = rootsToComponents(AMBUSH_UNIT_IDS);
    tmComponentSet = rootsToComponents(TREASURE_MAP_UNIT_IDS);
    kizunaComponentSet = rootsToComponents(KIZUNA_UNIT_IDS);
    fortnightComponentSet = rootsToComponents(FORTNIGHT_UNIT_IDS);
    rookieComponentSet = rootsToComponents(ROOKIE_UNIT_IDS);
    rumbleComponentSet = rootsToComponents(PIRATE_RUMBLE_UNIT_IDS);

    legendComponentSet = new Set();
    legendBaseIdSet = new Set();
    list.forEach((char) => {
      if (!char?.isLegend) return;
      const idRoot = getIdRoot(char?.id);
      const baseRoot = getIdRoot(char?.baseSixId);
      const comp = rootComponentMap.get(idRoot);
      if (comp) legendComponentSet.add(comp);
      if (idRoot) legendBaseIdSet.add(idRoot);
      if (baseRoot) legendBaseIdSet.add(baseRoot);
    });

    const families = new Map();
    list.forEach((char) => {
      if (!char?.isLegend) return;
      const idRoot = getIdRoot(char?.id);
      const comp = rootComponentMap.get(idRoot) || getFamilyId(char);
      if (!comp) return;
      if (!families.has(comp)) families.set(comp, []);
      families.get(comp).push(char);
    });

    sugoRepresentatives = [];
    sugoFamilyIdSet = new Set();
    families.forEach((familyChars, familyId) => {
      const rep = pickBestSugoRepresentative(familyChars);
      if (!rep) return;
      sugoRepresentatives.push(rep);
      sugoFamilyIdSet.add(familyId);
    });
  }

  function isBlockedBySugoFamily(char) {
    const idRoot = getIdRoot(char?.id);
    const baseRoot = getIdRoot(char?.baseSixId);
    const comp = rootComponentMap.get(idRoot) || rootComponentMap.get(baseRoot);
    if (comp && legendComponentSet.has(comp)) return true;
    return legendBaseIdSet.has(idRoot) || legendBaseIdSet.has(baseRoot);
  }

  function getComponentKeyForChar(char) {
    const idRoot = getIdRoot(char?.id);
    const baseRoot = getIdRoot(char?.baseSixId);
    return rootComponentMap.get(idRoot) || rootComponentMap.get(baseRoot) || getFamilyId(char);
  }

  function getLowestEvolutionRootIdForStory(char) {
    const comp = getComponentKeyForChar(char);
    const roots = comp ? componentRootIdsMap.get(comp) : null;
    let minId = Number.MAX_SAFE_INTEGER;
    if (roots && roots.size) {
      roots.forEach((root) => {
        const n = Number(getIdRoot(root));
        if (Number.isFinite(n) && n > 0 && n < minId) minId = n;
      });
    }
    if (minId !== Number.MAX_SAFE_INTEGER) return minId;
    const fallback = Number(getIdRoot(char?.id));
    return Number.isFinite(fallback) && fallback > 0 ? fallback : Number.MAX_SAFE_INTEGER;
  }

  function rootsToComponents(rootsSet) {
    const comps = new Set();
    (rootsSet || []).forEach((root) => {
      const comp = rootComponentMap.get(getIdRoot(root));
      if (comp) comps.add(comp);
    });
    return comps;
  }

  function isInComponentOrRoot(char, rootSet, componentSet) {
    const idRoot = getIdRoot(char?.id);
    const baseRoot = getIdRoot(char?.baseSixId);
    if ((rootSet && (rootSet.has(idRoot) || rootSet.has(baseRoot)))) return true;
    const comp = getComponentKeyForChar(char);
    return !!comp && !!componentSet && componentSet.has(comp);
  }

  function isInExactRootSet(char, rootSet) {
    if (!rootSet) return false;
    const idRoot = getIdRoot(char?.id);
    return !!idRoot && rootSet.has(idRoot);
  }

  function isPkaCharacter(char) {
    const idRoot = getIdRoot(char?.id);
    if (PKA_EXCLUDED_TO_OTHER.has(idRoot)) return false;
    return isInComponentOrRoot(char, pkaRootSet, pkaComponentSet);
  }

  function isCoopCharacter(char) {
    return isInComponentOrRoot(char, COOP_UNIT_IDS, coopComponentSet);
  }

  function isRaidCharacter(char) {
    return isInComponentOrRoot(char, RAID_UNIT_IDS, raidComponentSet);
  }

  function isColiseumCharacter(char) {
    const idRoot = getIdRoot(char?.id);
    if (COLISEUM_EXCLUDED_TO_OTHER.has(idRoot)) return false;
    return isInExactRootSet(char, COLISEUM_UNIT_IDS);
  }

  function isArenaCharacter(char) {
    return isInExactRootSet(char, ARENA_UNIT_IDS);
  }

  function isAmbushCharacter(char) {
    return isInComponentOrRoot(char, AMBUSH_UNIT_IDS, ambushComponentSet);
  }

  function isTreasureMapCharacter(char) {
    return isInComponentOrRoot(char, TREASURE_MAP_UNIT_IDS, tmComponentSet);
  }

  function isKizunaCharacter(char) {
    return isInComponentOrRoot(char, KIZUNA_UNIT_IDS, kizunaComponentSet);
  }

  function isFortnightCharacter(char) {
    const idRoot = getIdRoot(char?.id);
    if (FORTNIGHT_EXCLUDED_TO_STORY.has(idRoot)) return false;
    const comp = getComponentKeyForChar(char);
    if (comp && rookieComponentSet.has(comp)) return false;
    return isInComponentOrRoot(char, FORTNIGHT_UNIT_IDS, fortnightComponentSet);
  }

  function isRookieMissionCharacter(char) {
    return isInExactRootSet(char, ROOKIE_UNIT_IDS);
  }

  function isPirateRumbleCharacter(char) {
    return isInComponentOrRoot(char, PIRATE_RUMBLE_UNIT_IDS, rumbleComponentSet);
  }

  function isStoryCharacter(char) {
    // Story uses drop thumb as seed, but display should use the highest form in the same evolution family.
    const idRoot = getIdRoot(char?.id);
    if (STORY_EXCLUDED_TO_OTHER.has(idRoot)) return false;
    return isInComponentOrRoot(char, STORY_UNIT_IDS, storyComponentSet);
  }

  function isBoosterEvolverCharacter(char) {
    return isBoosterEvolverUnitId(char?.id);
  }

  function isFarmableF2pCharacter(char) {
    if (!char || char.isLegend) return false;
    if (hasRecruitOrSugoFlag(char.flags || {})) return false;
    return true;
  }

  function isRrSupportCharacter(char) {
    const flags = char?.flags || {};
    if (hasFlag(flags, "slrr")) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "support" || banner === "rr support";
  }

  function isRrTreasureMapCharacter(char) {
    const flags = char?.flags || {};
    if (hasFlag(flags, "tmlrr")) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr tm";
  }

  function isRrPirateRumbleCharacter(char) {
    const flags = char?.flags || {};
    if (hasFlag(flags, "pflrr")) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr pvp";
  }

  function isRrKizunaCharacter(char) {
    const flags = char?.flags || {};
    if (hasFlag(flags, "kclrr")) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr kizuna";
  }

  function isRrLimitedCharacter(char) {
    const flags = char?.flags || {};
    // Keep current sealed priority: TM / Kizuna / PvP / Support stay in their own banners.
    if (hasFlag(flags, "tmlrr") || hasFlag(flags, "kclrr") || hasFlag(flags, "pflrr") || hasFlag(flags, "slrr")) {
      return false;
    }
    if (hasFlag(flags, "lrr")) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr limited";
  }

  function isRrPromoCharacter(char) {
    const flags = char?.flags || {};
    const idRoot = getIdRoot(char?.id);
    if (RR_PROMO_FORCED_ROOT_IDS.has(idRoot)) return true;
    // Keep sealed priority: do not move characters already pinned to existing RR banners.
    if (hasFlag(flags, "tmlrr") || hasFlag(flags, "kclrr") || hasFlag(flags, "pflrr") || hasFlag(flags, "slrr") || hasFlag(flags, "lrr")) {
      return false;
    }
    if (hasFlag(flags, "promo") && hasRecruitOrSugoFlag(flags)) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr promo" || banner === "promo";
  }

  function isRrLoginBonusCharacter(char) {
    const flags = char?.flags || {};
    const idRoot = getIdRoot(char?.id);
    if (FORTNIGHT_UNIT_IDS_MANUAL.has(idRoot)) return false;
    if (RR_SHOP_FORCED_ROOT_IDS.has(idRoot)) return false;
    if (RR_LOGIN_BONUS_FORCED_ROOT_IDS.has(idRoot)) return true;
    // Keep sealed priority: do not move characters already pinned to existing RR banners.
    if (hasFlag(flags, "tmlrr") || hasFlag(flags, "kclrr") || hasFlag(flags, "pflrr") || hasFlag(flags, "slrr") || hasFlag(flags, "lrr")) {
      return false;
    }
    if (hasFlag(flags, "promo") && !hasRecruitOrSugoFlag(flags)) return true;
    const banner = String(char?.banner || "").trim().toLowerCase();
    return banner === "rr login bonus" || banner === "login bonus";
  }

  function isRrShopCharacter(char) {
    const flags = char?.flags || {};
    const idRoot = getIdRoot(char?.id);
    if (RR_SHOP_FORCED_ROOT_IDS.has(idRoot)) return true;
    if (!hasFlag(flags, "shop") && !hasFlag(flags, "tmshop")) return false;
    // Do not move units that already belong to an explicit non-RR banner.
    const existingBanner = String(char?.banner || "").trim();
    const existingPage = getPageFromBanner(existingBanner, String(char?.catalogPage || "f2p"));
    if (existingBanner && existingBanner.toLowerCase() !== "other" && existingPage !== "rr") {
      return false;
    }
    // Keep existing RR classifications first: do not move units already pinned elsewhere.
    if (
      isRrSupportCharacter(char)
      || isRrTreasureMapCharacter(char)
      || isRrKizunaCharacter(char)
      || isRrPirateRumbleCharacter(char)
      || isRrLimitedCharacter(char)
      || isRrPromoCharacter(char)
      || isRrLoginBonusCharacter(char)
    ) {
      return false;
    }
    return true;
  }

  function getRrBannerForChar(char) {
    const idRoot = getIdRoot(char?.id);
    if (RR_SHOP_FORCED_ROOT_IDS.has(idRoot)) return "Shop";
    if (RR_LOGIN_BONUS_FORCED_ROOT_IDS.has(idRoot)) return "Login Bonus";
    if (RR_PROMO_FORCED_ROOT_IDS.has(idRoot)) return "Promo";
    if (isRrPirateRumbleCharacter(char)) return "Pirate Rumble";
    if (isRrTreasureMapCharacter(char)) return "Treasure Map";
    if (isRrKizunaCharacter(char)) return "Kizuna Clash";
    if (isRrSupportCharacter(char)) return "Support";
    if (isRrLimitedCharacter(char)) return "Limited";
    if (isRrPromoCharacter(char)) return "Promo";
    if (isRrLoginBonusCharacter(char)) return "Login Bonus";
    if (isRrShopCharacter(char)) return "Shop";
    return "Other";
  }

  function getF2pBannerForChar(char) {
    if (!isFarmableF2pCharacter(char)) return "Other";
    const idRoot = getIdRoot(char?.id);
    if (PKA_EXCLUDED_TO_OTHER.has(idRoot)) return "Other";
    // Kizuna is strict: if it matches Kizuna drops, keep it in Kizuna.
    if (isKizunaCharacter(char)) return "Kizuna Clash";
    if (isPkaCharacter(char)) return "PKA";
    if (isCoopCharacter(char)) return "Co-op";
    if (isRaidCharacter(char)) return "Raid";
    if (isColiseumCharacter(char)) return "Colosseum";
    if (isArenaCharacter(char)) return "Arena";
    if (isAmbushCharacter(char)) return "Ambush";
    if (isTreasureMapCharacter(char)) return "Treasure Map";
    if (isFortnightCharacter(char)) return "Fortnight";
    if (isRookieMissionCharacter(char)) return "Rookie";
    if (isPirateRumbleCharacter(char)) return "Pirate Rumble";
    if (isStoryCharacter(char)) return "Story";
    return "Other";
  }

  function isExplicitF2pCharacter(char) {
    if (!isFarmableF2pCharacter(char)) return false;
    const b = getF2pBannerForChar(char);
    return b !== "Story" && b !== "Other";
  }

  function dedupeByFamily(list, page) {
    const byFamily = new Map();
    (Array.isArray(list) ? list : []).forEach((char) => {
      const familyId = page === "f2p"
        ? getComponentKeyForChar(char)
        : getFamilyId(char);
      if (!familyId) return;
      if (!byFamily.has(familyId)) byFamily.set(familyId, []);
      byFamily.get(familyId).push(char);
    });
    const bannerOrder = PAGE_BANNER_ORDER[page] || [];
    const bannerRank = (banner) => {
      if (page === "f2p") {
        const b = String(banner || "");
        if (b === "PKA") return 0;
        if (b === "Co-op") return 1;
        if (b === "Raid") return 2;
        if (b === "Colosseum") return 3;
        if (b === "Arena") return 4;
        if (b === "Ambush") return 5;
        if (b === "Treasure Map") return 6;
        if (b === "Kizuna Clash") return 7;
        if (b === "Fortnight") return 8;
        if (b === "Rookie") return 9;
        if (b === "Pirate Rumble") return 10;
        if (b === "Story") return 11;
        if (b === "Other") return 12;
      }
      const idx = bannerOrder.indexOf(String(banner || ""));
      return idx >= 0 ? idx : Number.MAX_SAFE_INTEGER;
    };
    const out = [];
    byFamily.forEach((familyChars) => {
      const sorted = [...familyChars].sort((a, b) => {
        const brA = bannerRank(a?.banner);
        const brB = bannerRank(b?.banner);
        if (brA !== brB) return brA - brB;
        const aNoVariant = String(a?.id || "").includes("-") ? 0 : 1;
        const bNoVariant = String(b?.id || "").includes("-") ? 0 : 1;
        if (aNoVariant !== bNoVariant) return bNoVariant - aNoVariant;
        const aFinal = a?.isFinalEvo ? 1 : 0;
        const bFinal = b?.isFinalEvo ? 1 : 0;
        if (aFinal !== bFinal) return bFinal - aFinal;
        const aLvl = Number(a?.maxLevel || 0);
        const bLvl = Number(b?.maxLevel || 0);
        if (aLvl !== bLvl) return bLvl - aLvl;
        return Number(b?.id || 0) - Number(a?.id || 0);
      });
      if (sorted[0]) out.push(sorted[0]);
    });
    return out;
  }

  function loadFlags() {
    return fetch(FLAGS_URL)
      .then((r) => r.text())
      .then((js) => {
        const getFlags = new Function(
          `${js}; return (typeof flags !== "undefined" ? flags : (typeof window !== "undefined" ? window.flags : null));`
        );
        return getFlags();
      })
      .catch(() => null);
  }

  function buildBannerInfoFromFlags(flags) {
    const map = new Map();
    const order = BANNER_DEFS.map((d) => d.label);
    const indexMap = new Map();
    if (!flags || typeof flags !== "object") {
      return { map, order, indexMap };
    }
    Object.keys(flags).forEach((id) => {
      const entry = flags[id] || {};
      const meta = deriveCatalogMeta(entry, null, id);
      if (meta?.banner) map.set(String(id), [meta.banner]);
    });
    Object.keys(BANNER_OVERRIDES).forEach((id) => {
      map.set(String(id), [BANNER_OVERRIDES[id]]);
    });
    return { map, order, indexMap };
  }

  function loadEvolutions() {
    return fetch(EVOLUTIONS_URL)
      .then((r) => r.text())
      .then((js) => {
        const getEvolutions = new Function(
          `${js}; return (typeof evolutions !== "undefined" ? evolutions : (typeof window !== "undefined" ? window.evolutions : null));`
        );
        return getEvolutions();
      })
      .catch(() => null);
  }

  function loadFamilies() {
    return fetch(FAMILIES_URL)
      .then((r) => r.text())
      .then((js) => {
        const getFamilies = new Function(
          `${js}; return (typeof families !== "undefined" ? families : (typeof window !== "undefined" ? window.families : null));`
        );
        return getFamilies();
      })
      .catch(() => null);
  }

  function loadDrops() {
    return fetch(DROPS_URL)
      .then((r) => r.text())
      .then((js) => {
        const getDrops = new Function(
          `${js}; return (typeof drops !== "undefined" ? drops : (typeof window !== "undefined" ? window.drops : null));`
        );
        return getDrops();
      })
      .catch(() => null);
  }

  function collectNumericIdsDeep(value, outSet) {
    if (!outSet) return;
    if (Array.isArray(value)) {
      value.forEach((entry) => collectNumericIdsDeep(entry, outSet));
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    const abs = Math.abs(Math.trunc(n));
    if (abs > 0) outSet.add(String(abs));
  }

  function getF2pBannerFromDropEntry(dropIdValue, sectionName = "") {
    const dropId = String(dropIdValue || "").toLowerCase();
    const section = String(sectionName || "").toLowerCase();
    if (dropId.includes("story")) return "Story";
    if (dropId.includes("pka")) return "PKA";
    if (dropId.includes("coop")) return "Co-op";
    if (dropId.includes("kizuna")) return "Kizuna Clash";
    if (dropId.includes("treasuremap")) return "Treasure Map";
    if (dropId.includes("ambush")) return "Ambush";
    if (dropId.includes("clash")) return "Raid";
    if (dropId.includes("event")) return "Fortnight";
    if (dropId.includes("rookie")) return "Rookie";
    if (dropId.includes("rumble")) return "Pirate Rumble";
    // drops.js has empty dropID for some old categories: keep explicit section fallback.
    if (section === "arena") return "Arena";
    if (section === "coliseum") return "Colosseum";
    return "";
  }

  function extractF2pBannerUnitIdsByDropId(drops) {
    const byBanner = new Map();
    const extractPkaRewardId = (entry) => {
      const rewards = Array.isArray(entry?.["Defeat Level Rewards"]) ? entry["Defeat Level Rewards"] : [];
      const nums = rewards
        .map((v) => Number(v))
        .filter((n) => Number.isFinite(n))
        .map((n) => Math.abs(Math.trunc(n)))
        .filter((n) => n > 0);
      return nums.length ? String(nums[nums.length - 1]) : "";
    };
    const collectIdLikeValues = (value, outSet) => {
      if (!outSet) return;
      if (Array.isArray(value)) {
        value.forEach((v) => collectIdLikeValues(v, outSet));
        return;
      }
      if (value === null || value === undefined) return;
      if (typeof value === "number") {
        const n = Math.abs(Math.trunc(value));
        if (n > 0) outSet.add(String(n));
        return;
      }
      if (typeof value === "string") {
        const m = value.match(/^(\d+)/);
        if (m && m[1]) outSet.add(String(Math.abs(Number(m[1]))));
      }
    };
    Object.entries(drops || {}).forEach(([sectionName, entries]) => {
      if (!Array.isArray(entries)) return;
      entries.forEach((entry) => {
        if (!entry || typeof entry !== "object") return;
        const banner = getF2pBannerFromDropEntry(entry.dropID, sectionName);
        if (!banner) return;
        if (!byBanner.has(banner)) byBanner.set(banner, new Set());
        if (banner === "PKA") {
          const picked = extractPkaRewardId(entry);
          if (picked) {
            byBanner.get(banner).add(picked);
            return;
          }
        }
        if (banner === "Kizuna Clash") {
          // Kizuna units can be referenced as skull IDs in exchange fields (e.g. "3720-skull").
          collectIdLikeValues(entry?.["All Difficulties"], byBanner.get(banner));
          collectIdLikeValues(entry?.["Kizuna Exchange"], byBanner.get(banner));
          Object.keys(entry).forEach((key) => {
            if (/^Round\s+\d+$/i.test(String(key))) {
              collectIdLikeValues(entry[key], byBanner.get(banner));
            }
          });
        }
        if (banner === "Raid") {
          collectIdLikeValues(entry?.["All Difficulties"], byBanner.get(banner));
          Object.keys(entry).forEach((key) => {
            const k = String(key || "").toLowerCase();
            if (["thumb", "name", "dropid", "shortname", "global", "nakama", "gamewith", "condition", "completion", "showmanual", "day"].includes(k)) return;
            // Raid drops may be listed under difficulty keys like Master/Expert/Ultimate/etc.
            collectIdLikeValues(entry[key], byBanner.get(banner));
          });
        }
        collectNumericIdsDeep(entry?.thumb, byBanner.get(banner));
      });
    });
    return byBanner;
  }

  function extractDropIdsFromSectionEntries(sectionEntries) {
    const set = new Set();
    if (!Array.isArray(sectionEntries)) return set;
    sectionEntries.forEach((entry) => {
      if (!entry || typeof entry !== "object") return;
      Object.keys(entry).forEach((key) => {
        if (["name", "dropID", "shortName", "thumb", "global", "nakama", "gamewith", "condition", "completion", "showManual", "day"].includes(key)) {
          return;
        }
        collectNumericIdsDeep(entry[key], set);
      });
      collectNumericIdsDeep(entry?.thumb, set);
    });
    return set;
  }

  function buildEvolutionBaseSet(evolutions) {
    const set = new Set();
    if (!evolutions || typeof evolutions !== "object") return set;
    Object.keys(evolutions).forEach((id) => {
      const entry = evolutions[id];
      if (entry && entry.evolution !== undefined && entry.evolution !== null) {
        set.add(String(id));
      }
    });
    return set;
  }

  function buildEvolutionParentMap(evolutions) {
    const map = new Map();
    if (!evolutions || typeof evolutions !== "object") return map;
    Object.keys(evolutions).forEach((id) => {
      const entry = evolutions[id];
      if (!entry || entry.evolution === undefined || entry.evolution === null) return;
      const children = Array.isArray(entry.evolution) ? entry.evolution : [entry.evolution];
      children.forEach((child) => {
        const key = String(child);
        if (!map.has(key)) map.set(key, new Set());
        map.get(key).add(String(id));
      });
    });
    return map;
  }

  function getPrimaryParentId(id, parentMap) {
    const parents = parentMap.get(String(id));
    if (!parents || parents.size === 0) return "";
    const arr = Array.from(parents).map(String);
    arr.sort((a, b) => Number(a) - Number(b));
    return arr[0] || "";
  }

  function getBaseSixId(id, unitsById, parentMap) {
    const start = String(id);
    const isSix = (u) => {
      const s = u?.stars;
      if (s === 6 || s === "6") return true;
      return false;
    };
    const visited = new Set();
    const queue = [start];
    let best = null;
    while (queue.length) {
      const cur = queue.shift();
      if (visited.has(cur)) continue;
      visited.add(cur);
      const unit = unitsById.get(cur);
      if (unit && isSix(unit)) {
        best = cur;
        break;
      }
      const parents = parentMap.get(cur);
      if (parents) parents.forEach((p) => { if (!visited.has(p)) queue.push(p); });
    }
    return best || start;
  }

  function isSixStar(unit) {
    const s = unit?.stars;
    if (typeof s === "number") return s >= 6;
    if (typeof s === "string") {
      const trimmed = s.trim();
      if (trimmed === "6+") return true;
      const num = Number(trimmed.replace(/[^0-9.]/g, ""));
      return Number.isFinite(num) && num >= 6;
    }
    return false;
  }

  function mapUnitType(code) {
    const typeMap = {
      STR: "str",
      DEX: "dex",
      QCK: "qck",
      PSY: "psy",
      INT: "int"
    };
    return typeMap[String(code || "").toUpperCase()] || "";
  }

  function clampInt(value, min, max) {
    const n = Number(value);
    if (!Number.isFinite(n)) return min;
    return Math.max(min, Math.min(max, Math.floor(n)));
  }

  function ensureLightbox() {
    if (lightboxEl && lightboxImg && lightboxThumbImg) return;
    lightboxEl = document.createElement("div");
    lightboxEl.id = "artwork-lightbox";
    lightboxEl.classList.add("hidden");
    lightboxThumbImg = document.createElement("img");
    lightboxThumbImg.className = "artwork-lightbox-thumb";
    lightboxThumbImg.alt = "";
    lightboxImg = document.createElement("img");
    lightboxImg.className = "artwork-lightbox-full";
    lightboxImg.alt = "Artwork";
    lightboxEl.append(lightboxThumbImg, lightboxImg);
    document.body.appendChild(lightboxEl);
    lightboxEl.addEventListener("click", closeLightbox);
  }

  function loadFirstDecoded(urls) {
    const list = (Array.isArray(urls) ? urls : [urls]).filter(Boolean);
    if (!list.length) return Promise.reject(new Error("no source"));
    // Si une source est deja decodee en cache, la renvoyer instantanement.
    for (const url of list) {
      if (decodedImageSet.has(url)) return Promise.resolve(url);
    }
    // Sinon, essayer une source apres l'autre pour eviter les chargements multiples inutiles.
    let chain = Promise.reject(new Error("start"));
    list.forEach((url) => {
      chain = chain.catch(() => loadImageDecoded(url));
    });
    return chain.catch(() => Promise.reject(new Error("no source")));
  }

  function prewarmArtwork(urlOrList) {
    const list = (Array.isArray(urlOrList) ? urlOrList : [urlOrList]).filter(Boolean);
    const url = list.find((u) => !failedImageSet.has(u)) || list[0];
    queueArtworkWarm(url);
  }

  function openLightbox(urlOrList, alt, thumbSrc) {
    if (!urlOrList) return;
    ensureLightbox();
    const requestToken = ++lightboxRequestToken;
    const finalAlt = alt || "Artwork";
    const list = (Array.isArray(urlOrList) ? urlOrList : [urlOrList]).filter(Boolean);
    const cached = list.find((u) => decodedImageSet.has(u));
    const fallbackThumb = thumbSrc || lightboxImg.getAttribute("src") || PLACEHOLDER_IMG;
    lightboxThumbImg.src = cached ? TRANSPARENT_PX : fallbackThumb;
    lightboxThumbImg.alt = "";
    lightboxEl.classList.toggle("has-full-artwork", !!cached);
    if (cached) {
      lightboxImg.alt = finalAlt;
      lightboxImg.src = cached;
      lightboxEl.classList.remove("is-loading");
      lightboxEl.classList.remove("hidden");
      return;
    }
    // Ouvre avec l'icone deja disponible, puis remplace seulement quand l'artwork est decode.
    lightboxImg.alt = "";
    lightboxImg.src = TRANSPARENT_PX;
    lightboxEl.classList.add("is-loading");
    lightboxEl.classList.remove("hidden");
    loadFirstDecoded(list)
      .then((url) => {
        if (requestToken !== lightboxRequestToken) return;
        lightboxImg.src = url;
        lightboxImg.alt = finalAlt;
        lightboxEl.classList.add("has-full-artwork");
        lightboxEl.classList.remove("is-loading");
      })
      .catch(() => {
        if (requestToken !== lightboxRequestToken) return;
        lightboxImg.src = fallbackThumb;
        lightboxImg.alt = finalAlt;
        lightboxEl.classList.add("has-full-artwork");
        lightboxEl.classList.remove("is-loading");
      });
  }

  function closeLightbox() {
    if (!lightboxEl) return;
    lightboxRequestToken += 1;
    lightboxEl.classList.add("hidden");
    lightboxEl.classList.remove("is-loading", "has-full-artwork");
  }

  function attachArtworkPreviewInteractions(item, character, options = {}) {
    if (!item || !character) return;
    const enableLongPress = options.enableLongPress !== false;
    const enableMiddleClick = options.enableMiddleClick !== false;
    const LONG_PRESS_MS = 550;
    const MOVE_TOLERANCE_PX = 10;
    let pressTimer = null;
    let pointerId = null;
    let startX = 0;
    let startY = 0;

    const clearPressTimer = () => {
      if (pressTimer) {
        clearTimeout(pressTimer);
        pressTimer = null;
      }
    };

    const openPreview = () => {
      if (!character.artwork) return;
      item.dataset.previewOpened = "1";
      openLightbox(
        character.artworkSources || character.artwork,
        character.name || "Artwork",
        character.icon || character.iconFallback
      );
    };

    const warm = (e) => {
      if (e?.pointerType === "touch") return;
      prewarmArtwork(character.artworkSources || character.artwork);
    };
    item.addEventListener("pointerenter", warm, { passive: true });

    item.addEventListener("mousedown", (e) => {
      if (enableMiddleClick && e.button === 1) e.preventDefault();
    });

    item.addEventListener("auxclick", (e) => {
      if (!enableMiddleClick) return;
      if (e.button !== 1) return;
      e.preventDefault();
      e.stopPropagation();
      openPreview();
    });

    item.addEventListener("pointerdown", (e) => {
      if (!enableLongPress) return;
      if (e.button !== 0) return;
      pointerId = e.pointerId;
      startX = e.clientX;
      startY = e.clientY;
      clearPressTimer();
      pressTimer = setTimeout(() => {
        pressTimer = null;
        openPreview();
      }, LONG_PRESS_MS);
    });

    item.addEventListener("pointermove", (e) => {
      if (pointerId === null || e.pointerId !== pointerId || !pressTimer) return;
      const dx = Math.abs(e.clientX - startX);
      const dy = Math.abs(e.clientY - startY);
      if (dx > MOVE_TOLERANCE_PX || dy > MOVE_TOLERANCE_PX) {
        clearPressTimer();
      }
    });

    item.addEventListener("pointerup", (e) => {
      if (pointerId !== null && e.pointerId === pointerId) pointerId = null;
      clearPressTimer();
    });
    item.addEventListener("pointercancel", () => {
      pointerId = null;
      clearPressTimer();
    });
    item.addEventListener("pointerleave", () => {
      clearPressTimer();
    });
    item.addEventListener("contextmenu", (e) => {
      e.preventDefault();
    });
  }

  function loadCharacters() {
    if (charactersLoaded) return Promise.resolve(characters);
    if (charactersLoading) return charactersLoading;
    charactersLoading = Promise.all([
      fetch(UNITS_URL).then((r) => r.text()),
      loadFlags(),
      loadEvolutions(),
      loadFamilies(),
      loadDrops()
    ])
      .then(([js, flags, evolutions, families, drops]) => {
        const f2pByDropId = extractF2pBannerUnitIdsByDropId(drops || {});
        const rootsOf = (banner) => new Set(
          Array.from(f2pByDropId.get(banner) || [])
            .map((id) => getIdRoot(id))
            .filter(Boolean)
        );
        PKA_UNIT_IDS = new Set([...PKA_UNIT_IDS_MANUAL, ...Array.from(rootsOf("PKA"))]);
        STORY_UNIT_IDS = new Set([...STORY_UNIT_IDS_MANUAL, ...Array.from(rootsOf("Story"))]);
        COOP_UNIT_IDS = rootsOf("Co-op");
        RAID_UNIT_IDS = rootsOf("Raid");
        COLISEUM_UNIT_IDS = new Set([...COLISEUM_UNIT_IDS_MANUAL, ...Array.from(rootsOf("Colosseum"))]);
        ARENA_UNIT_IDS = rootsOf("Arena");
        AMBUSH_UNIT_IDS = rootsOf("Ambush");
        TREASURE_MAP_UNIT_IDS = new Set([...TREASURE_MAP_UNIT_IDS_MANUAL, ...Array.from(rootsOf("Treasure Map"))]);
        KIZUNA_UNIT_IDS = new Set([...KIZUNA_UNIT_IDS_MANUAL, ...Array.from(rootsOf("Kizuna Clash"))]);
        FORTNIGHT_UNIT_IDS = new Set([...FORTNIGHT_UNIT_IDS_MANUAL, ...Array.from(rootsOf("Fortnight"))]);
        ROOKIE_UNIT_IDS = new Set([...ROOKIE_UNIT_IDS_MANUAL, ...rootsOf("Rookie"), ...rootsOf("Rookie Mission")]);
        PIRATE_RUMBLE_UNIT_IDS = rootsOf("Pirate Rumble");
        const boosterFromDrops = extractDropIdsFromSectionEntries((drops || {})["Booster and Evolver Island"]);
        BOOSTER_EVOLVER_UNIT_IDS = new Set(Array.from(boosterFromDrops).map((id) => getIdRoot(id)));
        const getUnits = new Function(
          `${js}; return (typeof units !== "undefined" ? units : (typeof window !== "undefined" ? window.units : null));`
        );
        const units = getUnits();
        if (!units || typeof units !== "object") {
          throw new Error("units.js: 'units' object not found");
        }
        const bannerInfo = buildBannerInfoFromFlags(flags);
        const bannerMap = bannerInfo.map;
        bannerOrder = bannerInfo.order;
        bannerIndexMap = bannerInfo.indexMap;
        const evoBaseSet = buildEvolutionBaseSet(evolutions);
        const evoParentMap = buildEvolutionParentMap(evolutions);
        const unitsById = new Map(Object.keys(units).map((k) => [String(k), units[k]]));
        allUnitsById = new Map(unitsById);
        const keys = Object.keys(units).sort((a, b) => Number(a) - Number(b));
        characters = keys
          .map((k) => units[k])
          .filter((u) => {
            if (!u) return false;
            const uid = String(u.id || "");
            if (EXCLUDED_IDS.has(uid)) return false;
            // Keep only the replacement target ID in catalogs.
            if (SPECIAL_ID_REPLACEMENTS.has(uid)) return false;
            return true;
          })
          .map((unit) => {
            const id = String(unit.id || "");
            const thumbSources = getThumbSources(id);
            const flagEntry = (flags && typeof flags === "object") ? (flags[id] || {}) : {};
            const catalogMeta = deriveCatalogMeta(flagEntry, unit, id);
            const forcedBanner = BANNER_OVERRIDES[id] || catalogMeta.banner || "";
            const forcedPage = getPageFromBanner(forcedBanner, catalogMeta.page);
            const unitFamiliesRaw = families?.[id];
            const unitFamilies = Array.isArray(unitFamiliesRaw)
              ? unitFamiliesRaw.map((f) => String(f || "").trim()).filter(Boolean)
              : [];
            const isFinalEvo = !evoBaseSet.has(id);
            const baseSixId = getBaseSixId(id, unitsById, evoParentMap);
            const parentId = getPrimaryParentId(id, evoParentMap);
            return {
              id,
              name: unit.name || "",
              families: unitFamilies,
              type: mapUnitType(unit.type),
              class: unit.class,
              rarity: unit.stars ? `${unit.stars}★` : "",
              cost: unit.cost,
              maxLevel: unit.maxLevel,
              banner: forcedBanner,
              catalogPage: forcedPage,
              flags: flagEntry,
              isLegend: isSixStar(unit),
              isFinalEvo,
              isSixPlus: String(unit.stars || "").trim() === "6+",
              baseSixId,
              parentId,
              baseSortId: Number(baseSixId) || Number(id) || 0,
              icon: thumbSources.primary,
              iconFallback: thumbSources.fallback,
              artwork: artUrl(id),
              artworkSources: getArtSources(id),
              __uid: String(id)
            };
          });
        rebuildSugoCatalogCache();
        charactersLoaded = true;
        return characters;
      })
      .catch((err) => {
        console.error("Error while loading characters:", err);
        characters = [];
        allUnitsById = new Map();
        return characters;
      });
    return charactersLoading;
  }

  function normalizeForSearch(s) {
    return String(s || "")
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function escapeRegex(value) {
    return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function hasWordMatch(name, query) {
    const normalizedName = normalizeForSearch(name);
    const tokens = normalizeForSearch(query).split(/\s+/).filter(Boolean);
    if (!tokens.length) return true;
    return tokens.every((token) => {
      // Real-time search: token must start at a word boundary, but can be a prefix.
      const re = new RegExp(`(^|[^a-z0-9])${escapeRegex(token)}`);
      return re.test(normalizedName);
    });
  }

  function hasFamilyMatch(char, query) {
    const families = Array.isArray(char?.families) ? char.families : [];
    if (!families.length) return false;
    return families.some((familyName) => hasWordMatch(familyName, query));
  }

  function hasEvolutionIdMatch(char, rawQuery, qDigits) {
    const query = String(rawQuery || "").trim();
    const idStr = String(char?.id || "");
    if (!query) return false;

    const compactQuery = query.replace(/\s+/g, "");
    const idLikeQuery = compactQuery.replace(/^#/, "");
    const isIdLikeQuery = /^\d+(?:-\d+)?$/.test(idLikeQuery);
    if (!isIdLikeQuery) return false;

    const matchesIdToken = (token) => {
      const t = String(token || "").trim();
      if (!t) return false;
      if (idStr === t) return true;
      if (/^\d+$/.test(t) && idStr.startsWith(`${t}-`)) return true;
      return false;
    };

    if (matchesIdToken(idLikeQuery)) return true;

    const queryRoot = getIdRoot(idLikeQuery);
    const queryDigits = String(qDigits || "");
    const replacedByRoot = SPECIAL_ID_REPLACEMENTS.get(queryRoot) || "";
    const replacedByDigits = SPECIAL_ID_REPLACEMENTS.get(queryDigits) || "";
    if (matchesIdToken(replacedByRoot)) return true;
    if (matchesIdToken(replacedByDigits)) return true;

    // Family fallback for ID searches: match any root ID in the same evolution component.
    const candidates = new Set();
    if (/^\d+$/.test(queryRoot)) candidates.add(queryRoot);
    if (/^\d+$/.test(queryDigits)) candidates.add(queryDigits);
    if (replacedByRoot) candidates.add(replacedByRoot);
    if (replacedByDigits) candidates.add(replacedByDigits);
    if (!candidates.size) return false;

    const comp = getComponentKeyForChar(char);
    if (!comp) return false;
    const roots = componentRootIdsMap.get(comp);
    if (!roots || !roots.size) return false;

    for (const cand of candidates) {
      for (const root of roots) {
        if (root === cand) return true;
      }
    }
    return false;
  }

  function buildBannerCompletionMarkup(ownedCount, totalCount) {
    const owned = Math.max(0, Math.round(Number(ownedCount) || 0));
    const total = Math.max(0, Math.round(Number(totalCount) || 0));
    const missing = Math.max(0, total - owned);
    const completion = `<span class="ap-count-main"><span class="ap-count-owned">${owned}</span><span class="ap-count-sep">/</span><span class="ap-count-total">${total}</span></span>`;
    if (total > 0 && missing === 0) {
      return `${completion}<span class="ap-count-side ap-count-check" aria-label="Banner complete" title="Banner complete">✓</span>`;
    }
    return `${completion}<span class="ap-count-side ap-count-missing" aria-label="${missing} missing">${missing}</span>`;
  }

  function setProgressCounts(ownedCount, totalCount) {
    if (!progressFill || !progressLabel) return;
    const total = Math.max(0, Math.round(Number(totalCount) || 0));
    const owned = Math.max(0, Math.min(total, Math.round(Number(ownedCount) || 0)));
    const ratio = total > 0 ? (owned / total) : 0;
    const pct = Math.max(0, Math.min(100, ratio * 100));
    progressFill.style.width = `${pct}%`;
    progressLabel.textContent = `${owned}/${total} (${pct.toFixed(1)}%)`;
  }

  function updateShipsProgress() {
    if (!shipsLoaded) {
      setProgressCounts(0, 0);
      return;
    }
    const total = shipsList.length;
    const owned = shipsList.reduce((count, ship) => count + (getShipEntry(ship.idx).owned ? 1 : 0), 0);
    setProgressCounts(owned, total);
  }

  function renderShipsCatalog(query = "") {
    if (!characterList) return;
    characterList.innerHTML = "";
    updateShipsProgress();
    if (!shipsLoaded) {
      const loading = document.createElement("div");
      loading.className = "empty-state";
      loading.textContent = "Loading ships…";
      characterList.appendChild(loading);
      requestAnimationFrame(applyDynamicMainPadding);
      return;
    }
    const q = normalizeForSearch(query || (searchInput?.value || ""));
    const mode = catalogOwnershipMode;
    const visible = shipsList.filter((s) => {
      if (q && !normalizeForSearch(`${s.id || ""} ${s.name}`).includes(q)) return false;
      const ent = getShipEntry(s.idx);
      if (mode === "owned") return ent.owned;
      if (mode === "missing") return !ent.owned;
      return true;
    });
    if (!visible.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No ship found.";
      characterList.appendChild(empty);
      requestAnimationFrame(applyDynamicMainPadding);
      return;
    }
    const grid = document.createElement("div");
    grid.className = "ap-grid ap-grid-inner ships-grid";
    visible.forEach((s) => {
      const ent = getShipEntry(s.idx);
      const item = document.createElement("button");
      item.type = "button";
      item.className = "ap-item ship-tile";
      if (ent.owned) item.classList.add("ship-owned");
      if (ent.owned && ent.level === SHIP_LEVEL_MAX) item.classList.add("is-max");
      item.title = `#${s.id || s.idx} ${s.name} — Lv ${ent.level}/${SHIP_LEVEL_MAX}`;

      const img = document.createElement("img");
      img.alt = s.name;
      img.loading = "lazy";
      img.decoding = "async";
      img.fetchPriority = "low";
      const thumbSrc = shipThumbUrl(s.icon || s.thumb);
      setShipImgWithFallback(img, thumbSrc, PLACEHOLDER_IMG);
      item.appendChild(img);

      if (ent.owned) {
        const lvl = document.createElement("span");
        lvl.className = "ship-tile-level";
        lvl.textContent = `Lv ${ent.level}`;
        item.appendChild(lvl);
      }

      attachArtworkPreviewInteractions(item, {
        ...s,
        icon: thumbSrc,
        artwork: s.artwork || shipArtworkUrl(s)
      });
      item.addEventListener("click", (e) => {
        e.stopPropagation();
        if (item.dataset.previewOpened === "1") {
          item.dataset.previewOpened = "0";
          return;
        }
        const cur = getShipEntry(s.idx);
        if (!cur.owned) {
          setShipEntry(s.idx, { owned: true, level: Math.max(cur.level, SHIP_LEVEL_MIN) });
          renderShipsCatalog(query);
        } else {
          openShipEditPopup(s);
        }
      });
      const openEdit = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (item.dataset.previewOpened === "1") return;
        openShipEditPopup(s);
      };
      item.addEventListener("contextmenu", openEdit);

      grid.appendChild(item);
    });
    characterList.appendChild(grid);
    requestAnimationFrame(applyDynamicMainPadding);
  }

  function openShipEditPopup(ship) {
    const ent = getShipEntry(ship.idx);
    let overlay = document.getElementById("ship-edit-overlay");
    if (overlay) overlay.remove();
    overlay = document.createElement("div");
    overlay.id = "ship-edit-overlay";
    overlay.className = "confirm-overlay ship-edit-overlay";
    overlay.innerHTML = `
      <div class="confirm-dialog ship-edit-dialog" role="dialog" aria-modal="true">
        <div class="ship-edit-head">
          <img class="ship-edit-thumb" alt="" />
          <div class="ship-edit-info">
            <div class="ship-edit-name"></div>
            <div class="ship-edit-meta"></div>
          </div>
        </div>
        <div class="ship-edit-details">
          <div class="ship-edit-section">
            <div class="ship-edit-section-title">Effect</div>
            <div class="ship-edit-desc"></div>
          </div>
          <div class="ship-edit-section ship-edit-special-block" hidden>
            <div class="ship-edit-section-title">Special</div>
            <div class="ship-edit-special"></div>
          </div>
        </div>
        <div class="ship-edit-row">
          <span>Level</span>
          <span class="ship-edit-lvl-val">${ent.level}/${SHIP_LEVEL_MAX}</span>
        </div>
        <input class="ship-edit-slider" type="range" min="${SHIP_LEVEL_MIN}" max="${SHIP_LEVEL_MAX}" step="1" value="${ent.level}" />
        <div class="ship-edit-quick">
          ${[1,3,5,7,9,SHIP_LEVEL_MAX].map((v) => `<button type="button" data-lvl="${v}" class="ship-edit-quick-btn">${v === SHIP_LEVEL_MAX ? "Max" : v}</button>`).join("")}
        </div>
        <div class="confirm-actions">
          <button type="button" class="confirm-btn ship-edit-unown">Mark unowned</button>
          <button type="button" class="confirm-btn is-primary ship-edit-save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const dialog = overlay.querySelector(".ship-edit-dialog");
    setShipImgWithFallback(overlay.querySelector(".ship-edit-thumb"), shipThumbUrl(ship.icon || ship.thumb), PLACEHOLDER_IMG);
    overlay.querySelector(".ship-edit-name").textContent = ship.name;
    const meta = overlay.querySelector(".ship-edit-meta");
    const chipValues = [`#${ship.id || ship.idx}`];
    if (ship.colaCount != null) chipValues.push(`Cola ${Number(ship.colaCount).toLocaleString("fr-FR")}`);
    if (ship.superColaCount != null && Number(ship.superColaCount) > 0) chipValues.push(`Super cola ${Number(ship.superColaCount).toLocaleString("fr-FR")}`);
    if (ship.hasSpecial && ship.hasSpecial !== "no") chipValues.push(ship.hasSpecial === "afterMRank5" ? "Special M.Rank 5" : "Special");
    chipValues.forEach((label) => {
      const chip = document.createElement("span");
      chip.className = "ship-edit-chip";
      chip.textContent = label;
      meta.appendChild(chip);
    });
    overlay.querySelector(".ship-edit-desc").textContent = ship.effect || ship.description || "";
    const specialBlock = overlay.querySelector(".ship-edit-special-block");
    if (ship.special) {
      specialBlock.hidden = false;
      overlay.querySelector(".ship-edit-special").textContent = ship.special;
    }
    const slider = overlay.querySelector(".ship-edit-slider");
    const lvlVal = overlay.querySelector(".ship-edit-lvl-val");
    slider.addEventListener("input", () => { lvlVal.textContent = `${slider.value}/${SHIP_LEVEL_MAX}`; });
    overlay.querySelectorAll(".ship-edit-quick-btn").forEach((b) => {
      b.addEventListener("click", () => { slider.value = String(b.dataset.lvl); lvlVal.textContent = `${slider.value}/${SHIP_LEVEL_MAX}`; });
    });
    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => { if (!e.target.closest(".ship-edit-dialog")) close(); });
    overlay.querySelector(".ship-edit-save").addEventListener("click", () => {
      setShipEntry(ship.idx, { owned: true, level: parseInt(slider.value, 10) || SHIP_LEVEL_MIN });
      close();
      renderShipsCatalog(searchInput?.value || "");
    });
    overlay.querySelector(".ship-edit-unown").addEventListener("click", () => {
      setShipEntry(ship.idx, { owned: false, level: SHIP_LEVEL_MIN });
      close();
      renderShipsCatalog(searchInput?.value || "");
    });
    setTimeout(() => dialog.focus(), 0);
  }

  function renderCharacters(query = "") {
    if (!characterList) return;
    if (activeCatalogPage === "ships") { renderShipsCatalog(query); return; }
    const q = normalizeForSearch(query || "");
    const qDigits = String(query || "").replace(/\D/g, "");
    const page = ["sugo", "rr", "f2p", "archive", "ships"].includes(activeCatalogPage) ? activeCatalogPage : "sugo";
    const getCatalogPoolForPage = (pageKey) => {
      const safePage = ["sugo", "rr", "f2p", "archive", "ships"].includes(pageKey) ? pageKey : "sugo";
      if (safePage === "archive") {
        return characters
          .filter((c) => !/-[12]$/.test(String(c?.id || "")))
          .map((c) => ({ ...c, banner: "Character Log" }));
      }
      const pool = safePage === "sugo"
      ? sugoRepresentatives.slice()
      : characters.filter((c) => {
          const isEligibleForF2p = safePage === "f2p"
            ? (!c.isLegend && !isBoosterEvolverCharacter(c) && !isRrSupportCharacter(c) && !isRrTreasureMapCharacter(c) && !isRrKizunaCharacter(c) && !isRrPirateRumbleCharacter(c) && !isRrLimitedCharacter(c) && !isRrPromoCharacter(c) && !isRrLoginBonusCharacter(c) && !isRrShopCharacter(c))
            : true;
          const isEligibleForRr = safePage === "rr"
            ? (isRrSupportCharacter(c) || isRrTreasureMapCharacter(c) || isRrKizunaCharacter(c) || isRrPirateRumbleCharacter(c) || isRrLimitedCharacter(c) || isRrPromoCharacter(c) || isRrLoginBonusCharacter(c) || isRrShopCharacter(c))
            : true;
          const explicitF2p = safePage === "f2p" && isExplicitF2pCharacter(c);
          const belongsToPage = safePage === "f2p"
            ? (["f2p", "rr"].includes(String(c.catalogPage || "f2p")) || explicitF2p)
            : (safePage === "rr"
              ? (String(c.catalogPage || "f2p") === "rr" || isRrPromoCharacter(c) || isRrLoginBonusCharacter(c) || isRrShopCharacter(c))
              : String(c.catalogPage || "f2p") === safePage);
          return (c.isFinalEvo || explicitF2p)
            && isEligibleForF2p
            && isEligibleForRr
            && belongsToPage
            && (!isBlockedBySugoFamily(c) || explicitF2p);
        });
      const rawPoolForPage = safePage === "f2p"
        ? pool.map((c) => ({
            ...c,
            banner: isPkaCharacter(c)
              ? "PKA"
              : (isCoopCharacter(c)
                ? "Co-op"
                : ((isRaidCharacter(c) && !RAID_EXCLUDED_TO_OTHER.has(getIdRoot(c?.id)))
                  ? "Raid"
                  : (isColiseumCharacter(c)
                    ? "Colosseum"
                    : (isArenaCharacter(c)
                      ? "Arena"
                      : (isAmbushCharacter(c)
                        ? "Ambush"
                        : (isTreasureMapCharacter(c)
                          ? "Treasure Map"
                          : (isKizunaCharacter(c)
                            ? ((String(c?.id || "").includes("-") || KIZUNA_EXCLUDED_TO_OTHER.has(getIdRoot(c?.id))) ? "Other" : "Kizuna Clash")
                        : (isRookieMissionCharacter(c)
                          ? "Rookie"
                          : (isPirateRumbleCharacter(c)
                            ? "Pirate Rumble"
                            : (isStoryCharacter(c) ? "Story" : "Other"))))))))))
          }))
        : (safePage === "rr"
          ? pool.map((c) => ({ ...c, banner: getRrBannerForChar(c) }))
          : pool);
      const adjustedF2pPool = safePage === "f2p"
        ? rawPoolForPage.map((c) => {
            if (String(c?.banner || "") === "Other" && isFortnightCharacter(c)) {
              return { ...c, banner: "Fortnight" };
            }
            return c;
          })
        : rawPoolForPage;
      const poolForPage = safePage === "f2p"
        ? adjustedF2pPool.filter((c) => {
            const banner = String(c?.banner || "");
            if (banner === "Fortnight" && /-(1|2)$/.test(String(c?.id || ""))) return false;
            const isOther = String(c?.banner || "") === "Other";
            if (isOther && OTHER_REMOVED_ROOT_IDS.has(getIdRoot(c?.id))) return false;
            return !(String(c?.id || "").includes("-") && isOther);
          })
        : adjustedF2pPool;
      return dedupeByFamily(poolForPage, safePage);
    };

    const updateGlobalProgress = () => {
      if (!progressFill || !progressLabel) return;
      const totalSet = new Set();
      const ownedSet = new Set();
      ["sugo", "rr", "f2p"].forEach((p) => {
        getCatalogPoolForPage(p).forEach((c) => {
          const uid = String(c?.__uid || c?.id || "");
          if (!uid) return;
          totalSet.add(uid);
          if (isSelected(uid)) ownedSet.add(uid);
        });
      });
      setProgressCounts(ownedSet.size, totalSet.size);
    };

    const dedupedPool = getCatalogPoolForPage(page);
    updateGlobalProgress();
    const preferFamilyAliasSearch = !!q && !qDigits
      && dedupedPool.some((c) => hasFamilyMatch(c, q));
    let filtered = q
      ? dedupedPool.filter((c) => {
          const familyMatch = hasFamilyMatch(c, q);
          const nameMatch = hasWordMatch(c.name || "", q);
          const idMatch = hasEvolutionIdMatch(c, query, qDigits);
          if (preferFamilyAliasSearch) return familyMatch || idMatch;
          return familyMatch || nameMatch || idMatch;
        })
      : dedupedPool.slice();
    if (selectedTypeFilters.size) {
      filtered = filtered.filter(passesTypeFilter);
    }

    const sortBy = getCurrentSortKey();
    filtered.sort((a, b) => {
      let result = 0;
      if (sortBy === "name") {
        result = String(a.name || "").localeCompare(String(b.name || ""));
      } else if (sortBy === "type") {
        result = getTypeSortRank(a) - getTypeSortRank(b);
        if (result === 0) {
          const aId = page === "sugo" ? Number(a.baseSortId || a.baseSixId || a.id || 0) : Number(a.id || 0);
          const bId = page === "sugo" ? Number(b.baseSortId || b.baseSixId || b.id || 0) : Number(b.id || 0);
          result = aId - bId;
          if (result === 0) {
            result = Number(a.id || 0) - Number(b.id || 0);
          }
        }
      } else {
        const aId = page === "sugo" ? Number(a.baseSortId || a.baseSixId || a.id || 0) : Number(a.id || 0);
        const bId = page === "sugo" ? Number(b.baseSortId || b.baseSixId || b.id || 0) : Number(b.id || 0);
        result = aId - bId;
        if (result === 0) {
          result = Number(a.id || 0) - Number(b.id || 0);
        }
      }
      return sortOrder === "asc" ? result : -result;
    });

    const isArchivePage = page === "archive";
    if (isArchivePage) {
      characterList.innerHTML = "";
      if (!filtered.length) {
        const empty = document.createElement("div");
        empty.className = "empty-state";
        empty.textContent = "No character found for this page.";
        characterList.appendChild(empty);
        requestAnimationFrame(applyDynamicMainPadding);
        return;
      }

      const grid = document.createElement("div");
      grid.className = "ap-grid ap-grid-inner";
      filtered.forEach((char) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ap-item";
        item.title = `${char.name || "character"} (#${char.id || ""})`;

        const img = document.createElement("img");
        img.alt = char.name || "character";
        img.loading = "lazy";
        img.decoding = "async";
        img.fetchPriority = "low";
        setImgWithFallback(img, char.icon, char.iconFallback || PLACEHOLDER_IMG);
        item.appendChild(img);

        item.addEventListener("click", (e) => {
          e.stopPropagation();
          openLightbox(char.artworkSources || char.artwork, char.name || "Artwork", char.icon || char.iconFallback);
        });

        grid.appendChild(item);
      });

      characterList.appendChild(grid);
      scheduleIdleArtworkWarmup(filtered);
      requestAnimationFrame(applyDynamicMainPadding);
      return;
    }
    const isAllMode = catalogOwnershipMode === "all";
    const isOwnedMode = catalogOwnershipMode === "owned";
    const isMissingMode = catalogOwnershipMode === "missing";

    const visible = filtered.filter((c) => {
      const owned = isSelected(c.__uid);
      if (isOwnedMode) return owned;
      if (isMissingMode) return !owned;
      return true;
    });

    const totalsByBanner = new Map();
    const ownedByBanner = new Map();
    filtered.forEach((char) => {
      const banner = String(char.banner || "").trim() || "Other";
      totalsByBanner.set(banner, (totalsByBanner.get(banner) || 0) + 1);
      if (isSelected(char.__uid)) {
        ownedByBanner.set(banner, (ownedByBanner.get(banner) || 0) + 1);
      }
    });

    const groups = new Map();
    visible.forEach((char) => {
      const banner = String(char.banner || "").trim() || "Other";
      if (!groups.has(banner)) groups.set(banner, []);
      groups.get(banner).push(char);
    });
    const ordered = [];
    const baseOrder = PAGE_BANNER_ORDER[page] || [];
    const forceRrBannerShell = page === "rr" && !q && isAllMode;
    if (isAllMode) {
      if (forceRrBannerShell) {
        baseOrder.forEach((b) => { if (!ordered.includes(b)) ordered.push(b); });
      } else {
        baseOrder.forEach((b) => { if (totalsByBanner.has(b)) ordered.push(b); });
      }
      Array.from(totalsByBanner.keys()).forEach((b) => { if (!ordered.includes(b)) ordered.push(b); });
    } else {
      if (forceRrBannerShell) {
        baseOrder.forEach((b) => { if (!ordered.includes(b)) ordered.push(b); });
      } else {
        baseOrder.forEach((b) => { if (groups.has(b)) ordered.push(b); });
      }
      Array.from(groups.keys()).forEach((b) => { if (!ordered.includes(b)) ordered.push(b); });
    }

    characterList.innerHTML = "";
    if (!ordered.length) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No character found for this page.";
      characterList.appendChild(empty);
      requestAnimationFrame(applyDynamicMainPadding);
      return;
    }

    ordered.forEach((banner) => {
      const section = document.createElement("div");
      section.className = "ap-section";
      if (page === "sugo") section.classList.add("is-sugo");

      const header = document.createElement("button");
      header.type = "button";
      header.className = "ap-section-header";
      const key = `${page}::${banner}`;
      const totalInBanner = totalsByBanner.get(banner) || 0;
      const ownedCount = ownedByBanner.get(banner) || 0;
      const missingCount = Math.max(0, totalInBanner - ownedCount);
      const isComplete = totalInBanner > 0 && missingCount === 0;
      const isOpenInitially = openBannerSet.has(key);
      header.setAttribute("aria-expanded", String(isOpenInitially));

      const title = document.createElement("div");
      title.className = "ap-section-title";
      title.textContent = banner;

      const count = document.createElement("div");
      count.className = "ap-section-count";
      count.innerHTML = buildBannerCompletionMarkup(ownedCount, totalInBanner);
      if (isComplete) section.classList.add("is-complete");
      header.append(title, count);

      const grid = document.createElement("div");
      grid.className = `ap-grid ap-grid-inner${isOpenInitially ? "" : " is-collapsed"}`;
      let charsInBanner = (groups.get(banner) || []).slice();
      if (page === "f2p" && banner === "Story") {
        charsInBanner.sort((a, b) => {
          const aMin = getLowestEvolutionRootIdForStory(a);
          const bMin = getLowestEvolutionRootIdForStory(b);
          if (aMin !== bMin) return aMin - bMin;
          return Number(a.id || 0) - Number(b.id || 0);
        });
      }
      charsInBanner.forEach((char) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ap-item";
        const uid = String(char.__uid || char.id || "");
        const isOwned = isSelected(uid);
        const levelValue = getLevelValue(uid);
        const isLevelMax99 = levelValue === 99;
        const isLevelMax150 = levelValue >= 150;
        const levelLabel = (isLevelMax99 || isLevelMax150) ? "MAX" : String(levelValue);
        const ccValue = getCottonCandyValue(uid);
        const lbBadgeValue = getLimitBreakBadgeValue(uid);
        const rainbowFrameValue = getRainbowFrameValue(uid);
        item.title = `${char.name || "character"} (#${char.id || ""})`;
        if (isOwned && levelValue > 0) {
          item.title += ` - Lv. ${levelLabel}`;
        }
        if (isOwned && ccValue > 0) {
          item.title += ` - CC ${ccValue}`;
        }
        if (isOwned && lbBadgeValue > 0) {
          item.title += ` - Limit Break ${lbBadgeValue}`;
        }
        if (isOwned && rainbowFrameValue > 0) {
          item.title += rainbowFrameValue === 2 ? " - Super Rainbow" : " - Rainbow";
        }
        if (isAllMode && !isOwned) {
          item.classList.add("is-owned");
        }
        if (isOwned && rainbowFrameValue === 1) item.classList.add("is-rainbow");
        if (isOwned && rainbowFrameValue === 2) item.classList.add("is-super-rainbow");

        const img = document.createElement("img");
        img.alt = char.name || "character";
        img.loading = "lazy";
        img.decoding = "async";
        img.fetchPriority = "low";
        setImgWithFallback(img, char.icon, char.iconFallback || PLACEHOLDER_IMG);
        item.appendChild(img);
        if (isOwned && levelValue > 0) {
          const levelBadge = document.createElement("span");
          levelBadge.className = "ap-item-level";
          const levelPrefix = document.createElement("span");
          levelPrefix.className = "ap-item-level-prefix";
          levelPrefix.textContent = "Lv.";
          const levelText = document.createElement("span");
          levelText.className = "ap-item-level-value";
          levelText.textContent = levelLabel;
          if (isLevelMax99) levelText.classList.add("is-max-99");
          if (isLevelMax150) levelText.classList.add("is-max");
          levelBadge.append(levelPrefix, levelText);
          item.appendChild(levelBadge);
        }
        if (isOwned && ccValue > 0) {
          const ccBadge = document.createElement("span");
          ccBadge.className = "ap-item-cc";
          const ccText = document.createElement("span");
          ccText.className = "ap-item-cc-value";
          ccText.textContent = `+${ccValue}`;
          ccBadge.append(ccText);
          item.appendChild(ccBadge);
        }
        if (isOwned && lbBadgeValue > 0) {
          const lbBadge = document.createElement("img");
          lbBadge.className = "ap-item-lb";
          lbBadge.alt = lbBadgeValue === 2 ? "Limit Break Super Max" : "Limit Break Max";
          lbBadge.decoding = "async";
          lbBadge.loading = "lazy";
          lbBadge.src = LIMIT_BREAK_BADGE_SRC[lbBadgeValue] || LIMIT_BREAK_BADGE_SRC[1];
          item.appendChild(lbBadge);
        }
        const shouldOpenArtworkOnClick = isOwnedMode && !isSelectionMode;
        const enablePreviewGestures = !shouldOpenArtworkOnClick && !isSelectionMode;
        attachArtworkPreviewInteractions(item, char, {
          enableLongPress: enablePreviewGestures,
          enableMiddleClick: enablePreviewGestures
        });
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          if (item.dataset.previewOpened === "1") {
            item.dataset.previewOpened = "0";
            return;
          }
          if (shouldOpenArtworkOnClick) {
            openLightbox(char.artworkSources || char.artwork, char.name || "Artwork", char.icon || char.iconFallback);
            return;
          }
          if (!uid) return;
          if (isSelectionMode) {
            if (!isSelected(uid)) return;
            if (!hasActiveEditAction()) return;
            let changed = false;
            if (editApplyLevel) {
              if (editClearLevelOnApply) {
                if (setLevelValue(uid, 0)) changed = true;
              } else if (setLevelValue(uid, editLevelTargetValue)) {
                changed = true;
              }
            }
            if (editApplyCottonCandy && setCottonCandyValue(uid, editCottonCandyValue)) {
              changed = true;
            }
            if (editApplyLimitBreak) {
              if (editLimitBreakChoice > 0) {
                if (setLimitBreakBadgeValue(uid, editLimitBreakChoice)) changed = true;
              } else if (editClearLimitBreakOnApply) {
                if (setLimitBreakBadgeValue(uid, 0)) changed = true;
              }
            }
            if (editApplyRainbow) {
              if (editRainbowChoice > 0) {
                if (setRainbowFrameValue(uid, editRainbowChoice)) changed = true;
              } else if (editClearRainbowOnApply) {
                if (setRainbowFrameValue(uid, 0)) changed = true;
              }
            }
            if (changed) {
              renderCharacters(searchInput?.value || "");
            }
            return;
          }
          toggleSelection(uid);
          renderCharacters(searchInput?.value || "");
        });

        grid.appendChild(item);
      });

      header.addEventListener("click", (e) => {
        e.stopPropagation();
        const isOpen = header.getAttribute("aria-expanded") === "true";
        header.setAttribute("aria-expanded", String(!isOpen));
        grid.classList.toggle("is-collapsed", isOpen);
        if (isOpen) openBannerSet.delete(key);
        else openBannerSet.add(key);
      });

      section.append(header, grid);
      characterList.appendChild(section);
    });

    scheduleIdleArtworkWarmup(visible);
    requestAnimationFrame(applyDynamicMainPadding);
  }

  // Search UI
  if (searchInput && clearSearchBtn) {
    searchInput.addEventListener("input", () => {
      clearSearchBtn.style.display = searchInput.value ? "block" : "none";
      renderCharacters(searchInput.value);
    });
    clearSearchBtn.addEventListener("click", () => {
      searchInput.value = "";
      clearSearchBtn.style.display = "none";
      searchInput.focus();
      renderCharacters("");
    });
  }

  function setCatalogOwnershipMode(mode) {
    const next = CATALOG_OWNERSHIP_MODES.has(mode) ? mode : "all";
    if (next === catalogOwnershipMode) return;
    catalogOwnershipMode = next;
    localStorage.setItem(CATALOG_REPEAT_KEY, catalogOwnershipMode);
    syncCatalogOwnershipToggle();
    renderCharacters(searchInput?.value || "");
  }

  function syncCatalogOwnershipToggle() {
    catalogOwnershipButtons.forEach((btn) => {
      const mode = String(btn.dataset.mode || "");
      const isOn = mode === catalogOwnershipMode;
      btn.classList.toggle("is-on", isOn);
      btn.setAttribute("aria-pressed", String(isOn));
    });
  }

  catalogOwnershipButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      setCatalogOwnershipMode(String(btn.dataset.mode || "all"));
    });
  });

  function setActiveCatalogPage(page) {
    const next = ["sugo", "rr", "f2p", "archive", "ships"].includes(page) ? page : "sugo";
    const previous = activeCatalogPage;
    if (previous && previous !== next) {
      // Close expanded banners from the page we are leaving.
      Array.from(openBannerSet).forEach((key) => {
        if (String(key).startsWith(`${previous}::`)) openBannerSet.delete(key);
      });
    }
    activeCatalogPage = next;
    localStorage.setItem("catalogPage", next);
    catalogTabs.forEach((btn) => {
      const isActive = btn.dataset.page === next;
      btn.classList.toggle("is-active", isActive);
      btn.setAttribute("aria-selected", String(isActive));
    });
    if (catalogOwnershipToggle) {
      const hideRepeat = next === "archive";
      catalogOwnershipToggle.hidden = hideRepeat;
      catalogOwnershipButtons.forEach((btn) => {
        btn.disabled = hideRepeat;
      });
    }
    const pageGroup = document.querySelector(".catalog-page-group");
    if (pageGroup) pageGroup.hidden = (next === "archive" || next === "ships");
    document.body.classList.toggle("is-ships-mode", next === "ships");
    const shipsBtnEl = document.getElementById("ships-toggle");
    if (shipsBtnEl) {
      const on = next === "ships";
      shipsBtnEl.classList.toggle("is-active", on);
      shipsBtnEl.setAttribute("aria-pressed", String(on));
    }
    if (next === "ships") {
      loadShips().then(() => {
        if (activeCatalogPage === "ships") renderShipsCatalog(searchInput?.value || "");
      });
    }
    renderCharacters(searchInput?.value || "");
  }

  catalogTabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      closeEditPanel();
      deactivateSelectionMode();
      const target = btn.dataset.page || "sugo";
      if (target === "archive" && activeCatalogPage === "archive") {
        const prev = localStorage.getItem("catalogPagePrev");
        const fallback = ["sugo", "rr", "f2p", "ships"].includes(prev) ? prev : "sugo";
        setActiveCatalogPage(fallback);
        return;
      }
      if (target !== "archive" || activeCatalogPage !== "archive") {
        if (activeCatalogPage && activeCatalogPage !== "archive" && activeCatalogPage !== "ships") {
          localStorage.setItem("catalogPagePrev", activeCatalogPage);
        }
      }
      setActiveCatalogPage(target);
    });
  });

  const shipsToggleBtn = document.getElementById("ships-toggle");
  if (shipsToggleBtn) {
    shipsToggleBtn.addEventListener("click", () => {
      closeEditPanel();
      deactivateSelectionMode();
      if (activeCatalogPage === "ships") {
        const prev = localStorage.getItem("catalogPagePrev");
        const fallback = ["sugo", "rr", "f2p"].includes(prev) ? prev : "sugo";
        setActiveCatalogPage(fallback);
        return;
      }
      if (activeCatalogPage && activeCatalogPage !== "archive" && activeCatalogPage !== "ships") {
        localStorage.setItem("catalogPagePrev", activeCatalogPage);
      }
      setActiveCatalogPage("ships");
    });
  }

  // Selection mode toggle (Edit tools)
  let isSelectionMode = false;
  const EDIT_LEVEL_MIN = 99;
  const EDIT_LEVEL_MAX = 150;
  let editLevelTargetValue = clampInt(
    localStorage.getItem(EDIT_LEVEL_TOOL_KEY) ?? EDIT_LEVEL_MIN,
    EDIT_LEVEL_MIN,
    EDIT_LEVEL_MAX
  );
  let editCottonCandyValue = clampInt(localStorage.getItem(EDIT_CC_TOOL_KEY) ?? 0, 0, 600);
  let editLimitBreakChoice = clampInt(localStorage.getItem(EDIT_LB_TOOL_KEY) ?? 0, 0, 2);
  let editClearLevelOnApply = false;
  let editClearLimitBreakOnApply = false;
  let editRainbowChoice = clampInt(localStorage.getItem(EDIT_RAINBOW_TOOL_KEY) ?? 0, 0, 2);
  let editClearRainbowOnApply = false;
  let editApplyLevel = localStorage.getItem(EDIT_APPLY_LEVEL_KEY) === "1";
  let editApplyCottonCandy = localStorage.getItem(EDIT_APPLY_CC_KEY) === "1";
  let editApplyLimitBreak = localStorage.getItem(EDIT_APPLY_LB_KEY) === "1";
  let editApplyRainbow = localStorage.getItem(EDIT_APPLY_RB_KEY) === "1";

  function getEditActionParts() {
    const parts = [];
    if (editApplyLevel) {
      if (editClearLevelOnApply) parts.push("LV clear");
      else parts.push(`LV ${editLevelTargetValue}/${EDIT_LEVEL_MAX}`);
    }
    if (editApplyCottonCandy) parts.push(`CC ${editCottonCandyValue}/600`);
    if (editApplyLimitBreak) {
      if (editLimitBreakChoice > 0) {
        parts.push(editLimitBreakChoice === 2 ? "LB Super Max" : "LB Max");
      } else if (editClearLimitBreakOnApply) {
        parts.push("LB clear");
      }
    }
    if (editApplyRainbow) {
      if (editRainbowChoice > 0) {
        parts.push(editRainbowChoice === 2 ? "Rainbow Super" : "Rainbow");
      } else if (editClearRainbowOnApply) {
        parts.push("Rainbow clear");
      }
    }
    return parts;
  }

  function hasActiveEditAction() {
    return getEditActionParts().length > 0;
  }
  function syncSelectionToggleState() {
    if (!selectionToggleBtn) return;
    selectionToggleBtn.setAttribute("aria-pressed", String(isSelectionMode));
    const parts = getEditActionParts();
    const suffix = parts.length ? parts.join(" • ") : "No action";
    selectionToggleBtn.title = isSelectionMode ? `Edit (${suffix})` : "Edit";
    selectionToggleBtn.setAttribute("aria-label", isSelectionMode ? `Edit active (${suffix})` : "Edit characters");
    if (editApplyBtn) editApplyBtn.disabled = !hasActiveEditAction();
  }
  function syncEditModeStatus() {
    if (!editModeStatus) return;
    editModeStatus.textContent = isSelectionMode ? "Mode Edit actif" : "Mode Edit inactif";
  }
  function syncEditActionSummary() {
    if (!editActionSummary) return;
    const parts = getEditActionParts();
    if (!parts.length) {
      editActionSummary.textContent = "Aucune modification sélectionnée.";
      return;
    }
    editActionSummary.textContent = `Application: ${parts.join(" • ")}`;
  }
  function syncEditFieldTogglesUI() {
    if (editEnableLevel) editEnableLevel.checked = editApplyLevel;
    if (editEnableCC) editEnableCC.checked = editApplyCottonCandy;
    if (editEnableLB) editEnableLB.checked = editApplyLimitBreak;
    if (editEnableRB) editEnableRB.checked = editApplyRainbow;

    editLevelBlock?.classList.toggle("is-disabled", !editApplyLevel);
    editCCBlock?.classList.toggle("is-disabled", !editApplyCottonCandy);
    editLBBlock?.classList.toggle("is-disabled", !editApplyLimitBreak);
    editRBBlock?.classList.toggle("is-disabled", !editApplyRainbow);

    if (editLevelSlider) editLevelSlider.disabled = !editApplyLevel;
    editLevelStepButtons.forEach((btn) => { btn.disabled = !editApplyLevel; });

    if (editCCSlider) editCCSlider.disabled = !editApplyCottonCandy;
    editCCStepButtons.forEach((btn) => {
      if (!editApplyCottonCandy) {
        btn.disabled = true;
        return;
      }
      const step = Math.trunc(Number(btn.dataset.step ?? 0));
      if (!Number.isFinite(step) || step === 0) {
        btn.disabled = true;
        return;
      }
      if (step > 0) btn.disabled = editCottonCandyValue >= 600;
      else btn.disabled = editCottonCandyValue <= 0;
    });

    editLBOptions.forEach((btn) => { btn.disabled = !editApplyLimitBreak; });
    editRBOptions.forEach((btn) => { btn.disabled = !editApplyRainbow; });
  }
  function updateEditLevelSliderFill() {
    if (!editLevelSlider) return;
    const v = Number(editLevelSlider.value);
    const min = Number(editLevelSlider.min) || 0;
    const max = Number(editLevelSlider.max) || 1;
    const denom = Math.max(1, max - min);
    const pct = Math.max(0, Math.min(100, ((v - min) / denom) * 100));
    editLevelSlider.style.background = `linear-gradient(90deg, #D79A4C 0%, #8F5123 ${pct}%, #1b1b1b ${pct}%, #1b1b1b 100%)`;
  }
  function syncEditLevelUI(value = editLevelTargetValue) {
    const next = clampInt(value, EDIT_LEVEL_MIN, EDIT_LEVEL_MAX);
    if (editLevelSlider) editLevelSlider.value = String(next);
    if (editLevelValue) editLevelValue.textContent = `${next}/${EDIT_LEVEL_MAX}`;
    updateEditLevelSliderFill();
  }
  function updateEditCCSliderFill() {
    if (!editCCSlider) return;
    const v = Number(editCCSlider.value);
    const min = Number(editCCSlider.min) || 0;
    const max = Number(editCCSlider.max) || 1;
    const denom = Math.max(1, max - min);
    const pct = Math.max(0, Math.min(100, ((v - min) / denom) * 100));
    editCCSlider.style.background = `linear-gradient(90deg, #D79A4C 0%, #8F5123 ${pct}%, #1b1b1b ${pct}%, #1b1b1b 100%)`;
  }
  function syncEditPanelValueUI(value = editCottonCandyValue) {
    const next = clampInt(value, 0, 600);
    if (editCCSlider) editCCSlider.value = String(next);
    if (editCCValue) editCCValue.textContent = `${next}/600`;
    editCCStepButtons.forEach((btn) => {
      if (!editApplyCottonCandy) {
        btn.disabled = true;
        return;
      }
      const step = Math.trunc(Number(btn.dataset.step ?? 0));
      if (!Number.isFinite(step) || step === 0) {
        btn.disabled = true;
        return;
      }
      if (step > 0) {
        btn.disabled = next >= 600;
      } else {
        btn.disabled = next <= 0;
      }
    });
    updateEditCCSliderFill();
  }
  function syncEditLimitBreakUI() {
    editLBOptions.forEach((btn) => {
      const val = clampInt(btn.dataset.lb ?? 0, 0, 2);
      const isOn = val > 0 && val === editLimitBreakChoice;
      btn.classList.toggle("is-on", isOn);
      btn.setAttribute("aria-pressed", String(isOn));
    });
  }
  function syncEditRainbowUI() {
    editRBOptions.forEach((btn) => {
      const val = clampInt(btn.dataset.rb ?? 0, 0, 2);
      const isOn = val > 0 && val === editRainbowChoice;
      btn.classList.toggle("is-on", isOn);
      btn.setAttribute("aria-pressed", String(isOn));
    });
  }
  function setEditLevelTargetValue(value, options = {}) {
    editLevelTargetValue = clampInt(value, EDIT_LEVEL_MIN, EDIT_LEVEL_MAX);
    editClearLevelOnApply = options.clearOnApply === true;
    localStorage.setItem(EDIT_LEVEL_TOOL_KEY, String(editLevelTargetValue));
    syncEditLevelUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditCottonCandyValue(value) {
    editCottonCandyValue = clampInt(value, 0, 600);
    localStorage.setItem(EDIT_CC_TOOL_KEY, String(editCottonCandyValue));
    syncEditPanelValueUI();
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditLimitBreakChoice(value, options = {}) {
    const next = clampInt(value, 0, 2);
    const shouldClearOnApply = options.clearOnApply === true;
    editLimitBreakChoice = next;
    localStorage.setItem(EDIT_LB_TOOL_KEY, String(editLimitBreakChoice));
    editClearLimitBreakOnApply = next === 0 ? shouldClearOnApply : false;
    syncEditLimitBreakUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditRainbowChoice(value, options = {}) {
    const next = clampInt(value, 0, 2);
    const shouldClearOnApply = options.clearOnApply === true;
    editRainbowChoice = next;
    localStorage.setItem(EDIT_RAINBOW_TOOL_KEY, String(editRainbowChoice));
    editClearRainbowOnApply = next === 0 ? shouldClearOnApply : false;
    syncEditRainbowUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditApplyLevel(enabled) {
    editApplyLevel = !!enabled;
    localStorage.setItem(EDIT_APPLY_LEVEL_KEY, editApplyLevel ? "1" : "0");
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditApplyCottonCandy(enabled) {
    editApplyCottonCandy = !!enabled;
    localStorage.setItem(EDIT_APPLY_CC_KEY, editApplyCottonCandy ? "1" : "0");
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditApplyLimitBreak(enabled) {
    editApplyLimitBreak = !!enabled;
    localStorage.setItem(EDIT_APPLY_LB_KEY, editApplyLimitBreak ? "1" : "0");
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setEditApplyRainbow(enabled) {
    editApplyRainbow = !!enabled;
    localStorage.setItem(EDIT_APPLY_RB_KEY, editApplyRainbow ? "1" : "0");
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncSelectionToggleState();
  }
  function setSelectionMode(active) {
    const next = !!active;
    if (next === isSelectionMode) return;
    isSelectionMode = next;
    body.classList.toggle("is-selection-mode", isSelectionMode);
    syncSelectionToggleState();
    syncEditModeStatus();
    if (charactersLoaded) renderCharacters(searchInput?.value || "");
  }
  function openEditPanel() {
    if (!editPanel) return;
    syncEditLevelUI();
    syncEditPanelValueUI();
    syncEditLimitBreakUI();
    syncEditRainbowUI();
    syncEditFieldTogglesUI();
    syncEditActionSummary();
    syncEditModeStatus();
    editPanel.hidden = false;
  }
  function closeEditPanel(options = {}) {
    if (!editPanel) return;
    const shouldDeactivate = options.deactivateMode === true;
    editPanel.hidden = true;
    if (shouldDeactivate) deactivateSelectionMode();
  }
  setSelectionMode(false);
  syncSelectionToggleState();
  syncEditLevelUI();
  syncEditPanelValueUI();
  syncEditLimitBreakUI();
  syncEditRainbowUI();
  syncEditFieldTogglesUI();
  syncEditActionSummary();
  syncEditModeStatus();
  selectionToggleBtn?.addEventListener("click", () => {
    openEditPanel();
  });
  editLevelSlider?.addEventListener("input", () => {
    if (editClearLevelOnApply) editClearLevelOnApply = false;
    syncEditLevelUI(editLevelSlider.value);
    syncEditActionSummary();
    syncSelectionToggleState();
  });
  editLevelStepButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (editClearLevelOnApply) editClearLevelOnApply = false;
      const next = clampInt(btn.dataset.level ?? EDIT_LEVEL_MIN, EDIT_LEVEL_MIN, EDIT_LEVEL_MAX);
      syncEditLevelUI(next);
      syncEditActionSummary();
      syncSelectionToggleState();
    });
  });
  editCCSlider?.addEventListener("input", () => {
    syncEditPanelValueUI(editCCSlider.value);
    syncEditActionSummary();
    syncSelectionToggleState();
  });
  editCCStepButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const step = Math.trunc(Number(btn.dataset.step ?? 0));
      if (!Number.isFinite(step) || step === 0) return;
      const baseValue = editCCSlider ? editCCSlider.value : editCottonCandyValue;
      syncEditPanelValueUI(clampInt(baseValue, 0, 600) + step);
      syncEditActionSummary();
      syncSelectionToggleState();
    });
  });
  editEnableLevel?.addEventListener("change", () => setEditApplyLevel(editEnableLevel.checked));
  editEnableCC?.addEventListener("change", () => setEditApplyCottonCandy(editEnableCC.checked));
  editEnableLB?.addEventListener("change", () => setEditApplyLimitBreak(editEnableLB.checked));
  editEnableRB?.addEventListener("change", () => setEditApplyRainbow(editEnableRB.checked));
  editLBOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = clampInt(btn.dataset.lb ?? 0, 0, 2);
      if (!value) return;
      if (editLimitBreakChoice === value) {
        setEditLimitBreakChoice(0);
      } else {
        setEditLimitBreakChoice(value);
      }
    });
  });
  editRBOptions.forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = clampInt(btn.dataset.rb ?? 0, 0, 2);
      if (!value) return;
      if (editRainbowChoice === value) {
        setEditRainbowChoice(0);
      } else {
        setEditRainbowChoice(value);
      }
    });
  });
  editApplyBtn?.addEventListener("click", () => {
    setEditLevelTargetValue(
      editLevelSlider?.value ?? EDIT_LEVEL_MIN,
      { clearOnApply: editClearLevelOnApply }
    );
    setEditCottonCandyValue(editCCSlider?.value ?? 0);
    setEditLimitBreakChoice(
      editLimitBreakChoice,
      { clearOnApply: editClearLimitBreakOnApply }
    );
    setEditRainbowChoice(
      editRainbowChoice,
      { clearOnApply: editClearRainbowOnApply }
    );
    if (!hasActiveEditAction()) {
      window.alert("Aucune modification sélectionnée. Active au moins un bloc Apply.");
      return;
    }
    setSelectionMode(true);
    closeEditPanel();
  });
  editDeactivateBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    deactivateSelectionMode();
    closeEditPanel();
  });
  editClearBtn?.addEventListener("click", () => {
    setEditLevelTargetValue(EDIT_LEVEL_MIN, { clearOnApply: true });
    setEditCottonCandyValue(0);
    setEditLimitBreakChoice(0, { clearOnApply: true });
    setEditRainbowChoice(0, { clearOnApply: true });
    setEditApplyLevel(true);
    setEditApplyCottonCandy(true);
    setEditApplyLimitBreak(true);
    setEditApplyRainbow(true);
  });
  editCloseBtn?.addEventListener("click", () => {
    closeEditPanel({ deactivateMode: true });
  });
  editPanel?.addEventListener("click", (e) => {
    if (!e.target.closest(".fp-dialog")) closeEditPanel({ deactivateMode: true });
  });

  function deactivateSelectionMode() {
    if (isSelectionMode) setSelectionMode(false);
  }

  // Panels helpers
  const openPanel = (panel, toggleBtn) => {
    if (!panel) return;
    panel.hidden = false;
    toggleBtn?.setAttribute("aria-expanded", "true");
  };
  const closePanel = (panel, toggleBtn) => {
    if (!panel) return;
    panel.hidden = true;
    toggleBtn?.setAttribute("aria-expanded", "false");
  };

  // Settings panel
  settingsToggle?.addEventListener("click", () => {
    closeEditPanel();
    deactivateSelectionMode();
    openPanel(settingsPanel, settingsToggle);
  });
  spClose?.addEventListener("click", () => closePanel(settingsPanel, settingsToggle));
  spCloseBtn?.addEventListener("click", () => closePanel(settingsPanel, settingsToggle));
  settingsPanel?.addEventListener("click", (e) => {
    if (!e.target.closest(".fp-dialog")) closePanel(settingsPanel, settingsToggle);
  });

  // Theme toggle
  let currentTheme = localStorage.getItem("baseTheme") || "dark";
  const applyTheme = (theme) => {
    body.classList.toggle("light-mode", theme === "light");
    currentTheme = theme;
    localStorage.setItem("baseTheme", theme);
    if (themeLabel) themeLabel.textContent = theme === "dark" ? "Dark mode" : "Light mode";
  };
  applyTheme(currentTheme);
  themeToggle?.addEventListener("click", () => {
    applyTheme(currentTheme === "dark" ? "light" : "dark");
  });

  const BACKUP_FILE_PREFIX = "optc-sugo-manager-backup";
  const CATALOG_PAGES = ["sugo", "rr", "f2p", "archive", "ships"];

  function cloneJsonSafe(value, fallback) {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch {
      return fallback;
    }
  }

  function sanitizeObject(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value;
  }

  function sanitizeOwnedList(value) {
    if (!Array.isArray(value)) return [];
    const unique = new Set();
    value.forEach((entry) => {
      const id = String(entry || "").trim();
      if (!id) return;
      unique.add(id);
    });
    return Array.from(unique);
  }

  function sanitizeUnitState(value) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    const output = {};
    Object.entries(value).forEach(([key, rawState]) => {
      const uid = String(key || "").trim();
      if (!uid) return;
      if (!rawState || typeof rawState !== "object" || Array.isArray(rawState)) return;
      const state = cloneJsonSafe(rawState, null);
      if (!state || typeof state !== "object" || Array.isArray(state)) return;
      output[uid] = state;
    });
    return output;
  }

  function buildBackupPayload() {
    return {
      app: BACKUP_APP_ID,
      version: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        ownedCharacters: cloneJsonSafe(savedBox, []),
        unitProgress: cloneJsonSafe(unitStateMap, {}),
        gatherIsland: cloneJsonSafe(readIslandLevels(), {}),
        ships: cloneJsonSafe(shipsState, {}),
        preferences: {
          theme: currentTheme,
          sortBy: getCurrentSortKey(),
          sortOrder,
          catalogPage: activeCatalogPage,
          catalogOwnershipMode,
          showSelectedInCatalog: catalogOwnershipMode === "all",
          editTools: {
            level: editLevelTargetValue,
            clearLevelOnApply: editClearLevelOnApply,
            cottonCandy: editCottonCandyValue,
            limitBreakChoice: editLimitBreakChoice,
            clearLimitBreakOnApply: editClearLimitBreakOnApply,
            rainbowChoice: editRainbowChoice,
            clearRainbowOnApply: editClearRainbowOnApply,
            applyLevel: editApplyLevel,
            applyCottonCandy: editApplyCottonCandy,
            applyLimitBreak: editApplyLimitBreak,
            applyRainbow: editApplyRainbow
          }
        }
      }
    };
  }

  function exportBackupJson() {
    const payload = buildBackupPayload();
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const filename = `${BACKUP_FILE_PREFIX}-${stamp}.json`;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function getBackupDataRoot(parsed) {
    const root = sanitizeObject(parsed);
    if (Object.keys(root).length === 0) throw new Error("Format de backup invalide.");
    const data = sanitizeObject(root.data);
    return Object.keys(data).length ? data : root;
  }

  function applyImportedBackup(parsed) {
    const data = getBackupDataRoot(parsed);
    const hasSupportedData = [
      data.ownedCharacters,
      data.owned,
      data.savedBox,
      data[STORAGE_KEY],
      data.box,
      data.unitProgress,
      data.unitState,
      data.unitStateMap,
      data[UNIT_STATE_KEY],
      data.units,
      data.gatherIsland,
      data.island,
      data.islandLevels,
      data[ISLAND_KEY]
    ].some((value) => value !== undefined);
    if (!hasSupportedData) {
      throw new Error("Le fichier ne contient pas de données de backup reconnues.");
    }

    const importedBox = sanitizeObject(data.box);
    const importedUnits = sanitizeObject(data.units);
    const importedGatherIsland = sanitizeObject(data.gatherIsland);
    const ownedCharacters = sanitizeOwnedList(
      data.ownedCharacters
      ?? importedBox.owned
      ?? data.owned
      ?? data.savedBox
      ?? data[STORAGE_KEY]
    );
    const importedUnitState = sanitizeUnitState(
      data.unitProgress
      ?? importedUnits.state
      ?? data.unitState
      ?? data.unitStateMap
      ?? data[UNIT_STATE_KEY]
    );
    const importedIsland = sanitizeObject(
      importedGatherIsland.levels
      ?? data.gatherIsland
      ?? data.island
      ?? data.islandLevels
      ?? data[ISLAND_KEY]
    );
    const importedPrefs = sanitizeObject(data.preferences);
    const importedEditTools = sanitizeObject(importedPrefs.editTools);

    savedBox = ownedCharacters;
    unitStateMap = importedUnitState;
    persistBox();
    persistUnitStateMap();
    localStorage.setItem(BOX_SCHEMA_KEY, BOX_SCHEMA_VERSION);
    saveIslandLevels(importedIsland);
    if (data.ships && typeof data.ships === "object" && !Array.isArray(data.ships)) {
      const incoming = {};
      Object.entries(data.ships).forEach(([k, v]) => {
        if (!v || typeof v !== "object") return;
        const lvl = Math.max(SHIP_LEVEL_MIN, Math.min(SHIP_LEVEL_MAX, parseInt(v.level, 10) || SHIP_LEVEL_MIN));
        const owned = !!v.owned;
        if (!owned && lvl === SHIP_LEVEL_MIN) return;
        incoming[String(k)] = { owned, level: lvl };
      });
      shipsState = incoming;
      persistShipsState();
    }

    if (importedPrefs.theme === "dark" || importedPrefs.theme === "light") {
      applyTheme(importedPrefs.theme);
    }

    const importedSort = normalizeSortKey(importedPrefs.sortBy ?? importedPrefs.sort ?? getCurrentSortKey());
    const importedSortOrder = importedPrefs.sortOrder === "asc"
      ? "asc"
      : (importedPrefs.sortOrder === "desc" ? "desc" : sortOrder);
    sortOrder = importedSortOrder;
    localStorage.setItem(SORT_KEY, importedSort);
    localStorage.setItem("boxSortOrder", importedSortOrder);

    let importedMode = "";
    if (CATALOG_OWNERSHIP_MODES.has(String(importedPrefs.catalogOwnershipMode || "").toLowerCase())) {
      importedMode = String(importedPrefs.catalogOwnershipMode || "").toLowerCase();
    } else if (typeof importedPrefs.showSelectedInCatalog === "boolean") {
      importedMode = importedPrefs.showSelectedInCatalog ? "all" : "owned";
    }
    if (importedMode) {
      catalogOwnershipMode = importedMode;
      localStorage.setItem(CATALOG_REPEAT_KEY, catalogOwnershipMode);
      syncCatalogOwnershipToggle();
    }

    setEditLevelTargetValue(
      importedEditTools.level ?? editLevelTargetValue,
      { clearOnApply: importedEditTools.clearLevelOnApply ?? editClearLevelOnApply }
    );
    setEditCottonCandyValue(importedEditTools.cottonCandy ?? editCottonCandyValue);
    setEditLimitBreakChoice(
      importedEditTools.limitBreakChoice ?? editLimitBreakChoice,
      { clearOnApply: importedEditTools.clearLimitBreakOnApply ?? editClearLimitBreakOnApply }
    );
    setEditRainbowChoice(
      importedEditTools.rainbowChoice ?? editRainbowChoice,
      { clearOnApply: importedEditTools.clearRainbowOnApply ?? editClearRainbowOnApply }
    );
    setEditApplyLevel(importedEditTools.applyLevel ?? editApplyLevel);
    setEditApplyCottonCandy(importedEditTools.applyCottonCandy ?? editApplyCottonCandy);
    setEditApplyLimitBreak(importedEditTools.applyLimitBreak ?? editApplyLimitBreak);
    setEditApplyRainbow(importedEditTools.applyRainbow ?? editApplyRainbow);

    const nextPage = CATALOG_PAGES.includes(importedPrefs.catalogPage) ? importedPrefs.catalogPage : activeCatalogPage;
    setActiveCatalogPage(nextPage);
    renderCharacters(searchInput?.value || "");
    if (islandPanel && !islandPanel.hidden) renderIslandPanel();
    if (islandCalcPanel && !islandCalcPanel.hidden) renderIslandCalcPanel();
  }

  settingsExportBtn?.addEventListener("click", exportBackupJson);
  exportBtn?.addEventListener("click", exportBackupJson);
  settingsImportBtn?.addEventListener("click", () => {
    importInput?.click();
  });
  importInput?.addEventListener("change", async () => {
    const file = importInput.files?.[0];
    importInput.value = "";
    if (!file) return;
    const shouldImport = window.confirm("Importer ce backup remplacera vos données actuelles. Continuer ?");
    if (!shouldImport) return;
    try {
      const content = await file.text();
      const parsed = JSON.parse(content);
      applyImportedBackup(parsed);
      window.alert("Backup importé avec succès.");
    } catch (error) {
      console.error(error);
      window.alert("Import impossible : JSON invalide ou format non reconnu.");
    }
  });

  function getResetScopesSelection() {
    return {
      units: Boolean(settingsResetUnits?.checked),
      island: Boolean(settingsResetIsland?.checked),
      ships: Boolean(settingsResetShips?.checked)
    };
  }

  function syncSettingsResetDialogState() {
    const applyAll = Boolean(settingsResetAll?.checked);
    if (settingsResetUnits) {
      if (applyAll) settingsResetUnits.checked = true;
      settingsResetUnits.disabled = applyAll;
    }
    if (settingsResetIsland) {
      if (applyAll) settingsResetIsland.checked = true;
      settingsResetIsland.disabled = applyAll;
    }
    if (settingsResetShips) {
      if (applyAll) settingsResetShips.checked = true;
      settingsResetShips.disabled = applyAll;
    }
    const { units, island, ships } = getResetScopesSelection();
    if (settingsResetApply) {
      settingsResetApply.disabled = !(units || island || ships);
    }
  }

  function openSettingsResetDialog() {
    if (!settingsResetDialog) return;
    if (settingsResetUnits) settingsResetUnits.checked = false;
    if (settingsResetIsland) settingsResetIsland.checked = false;
    if (settingsResetShips) settingsResetShips.checked = false;
    if (settingsResetAll) settingsResetAll.checked = false;
    syncSettingsResetDialogState();
    settingsResetDialog.hidden = false;
  }

  function closeSettingsResetDialog() {
    if (!settingsResetDialog) return;
    settingsResetDialog.hidden = true;
  }

  function applySelectedDataReset(scopes) {
    let changed = false;
    if (scopes.units) {
      savedBox = [];
      unitStateMap = {};
      persistBox();
      persistUnitStateMap();
      localStorage.setItem(BOX_SCHEMA_KEY, BOX_SCHEMA_VERSION);
      changed = true;
    }
    if (scopes.island) {
      saveIslandLevels({});
      changed = true;
    }
    if (scopes.ships) {
      shipsState = {};
      persistShipsState();
      changed = true;
    }
    if (!changed) return;
    renderCharacters(searchInput?.value || "");
    if (islandPanel && !islandPanel.hidden) renderIslandPanel();
    if (islandCalcPanel && !islandCalcPanel.hidden) renderIslandCalcPanel();
  }

  const resetScopeInputs = [settingsResetUnits, settingsResetIsland, settingsResetShips, settingsResetAll].filter(Boolean);
  resetScopeInputs.forEach((input) => {
    input.addEventListener("change", syncSettingsResetDialogState);
  });

  settingsResetBtn?.addEventListener("click", () => {
    openSettingsResetDialog();
  });
  settingsResetCancel?.addEventListener("click", () => closeSettingsResetDialog());
  settingsResetDialog?.addEventListener("click", (e) => {
    if (!e.target.closest(".confirm-dialog")) closeSettingsResetDialog();
  });
  settingsResetApply?.addEventListener("click", () => {
    const scopes = getResetScopesSelection();
    const labels = [];
    if (scopes.units) labels.push("Perso");
    if (scopes.island) labels.push("Gather Island");
    if (scopes.ships) labels.push("Ships");
    if (!labels.length) return;

    const confirmStep1 = window.confirm(`Remettre a zero: ${labels.join(" + ")} ?`);
    if (!confirmStep1) return;
    const confirmStep2 = window.confirm("Confirmation finale: cette action est irreversible. Continuer ?");
    if (!confirmStep2) return;

    applySelectedDataReset(scopes);
    closeSettingsResetDialog();
    window.alert(`Reset termine (${labels.join(" + ")}).`);
  });

  // Sort dropdown
  const closeSortMenu = () => {
    if (!sortMenu || !sortToggle) return;
    sortMenu.hidden = true;
    sortToggle.setAttribute("aria-expanded", "false");
  };
  const openSortMenu = () => {
    if (!sortMenu || !sortToggle) return;
    sortMenu.hidden = false;
    sortToggle.setAttribute("aria-expanded", "true");
    updateSortMenuLabels();
  };
  const updateSortMenuLabels = () => {
    if (!sortMenu) return;
    const currentSort = getCurrentSortKey();
    sortMenu.querySelectorAll(".sort-item").forEach((btn) => {
      const arrow = btn.querySelector(".sort-arrow");
      if (!arrow) return;
      if (btn.dataset.sort === currentSort) {
        arrow.textContent = sortOrder === "asc" ? "▴" : "▾";
      } else {
        arrow.textContent = "";
      }
    });
  };
  sortToggle?.addEventListener("click", () => {
    closeEditPanel();
    deactivateSelectionMode();
    if (sortToggle.getAttribute("aria-expanded") === "true") closeSortMenu();
    else openSortMenu();
  });
  document.addEventListener("click", (e) => {
    if (!sortMenu || !sortToggle) return;
    if (!sortMenu.contains(e.target) && !sortToggle.contains(e.target)) closeSortMenu();
  });
  sortMenu?.addEventListener("click", (e) => {
    const item = e.target.closest(".sort-item");
    if (!item) return;
    const sortBy = normalizeSortKey(item.dataset.sort);
    const currentSort = getCurrentSortKey();
    let newOrder;
    if (sortBy === currentSort) {
      newOrder = sortOrder === "asc" ? "desc" : "asc";
    } else {
      newOrder = sortBy === "id" ? "desc" : "asc";
    }
    localStorage.setItem(SORT_KEY, sortBy);
    localStorage.setItem("boxSortOrder", newOrder);
    sortOrder = newOrder;
    renderCharacters(searchInput?.value || "");
    updateSortMenuLabels();
    closeSortMenu();
  });

  // ===== Type filter dropdown =====
  const typeFilterToggle = document.getElementById("type-filter-toggle");
  const typeFilterMenu = document.getElementById("type-filter-menu");
  const typeFilterBadge = document.getElementById("type-filter-badge");
  const typeFilterClear = document.getElementById("type-filter-clear");
  function closeTypeFilterMenu() {
    if (!typeFilterMenu || !typeFilterToggle) return;
    typeFilterMenu.hidden = true;
    typeFilterToggle.setAttribute("aria-expanded", "false");
  }
  function openTypeFilterMenu() {
    if (!typeFilterMenu || !typeFilterToggle) return;
    typeFilterMenu.hidden = false;
    typeFilterToggle.setAttribute("aria-expanded", "true");
  }
  function refreshTypeFilterUI() {
    if (!typeFilterMenu) return;
    typeFilterMenu.querySelectorAll(".type-filter-item").forEach((btn) => {
      const t = String(btn.dataset.type || "").toLowerCase();
      btn.setAttribute("aria-pressed", selectedTypeFilters.has(t) ? "true" : "false");
    });
    if (typeFilterBadge) {
      const n = selectedTypeFilters.size;
      typeFilterBadge.hidden = n === 0;
      typeFilterBadge.textContent = String(n);
    }
  }
  refreshTypeFilterUI();
  typeFilterToggle?.addEventListener("click", () => {
    closeEditPanel();
    deactivateSelectionMode();
    closeSortMenu();
    if (typeFilterToggle.getAttribute("aria-expanded") === "true") closeTypeFilterMenu();
    else openTypeFilterMenu();
  });
  document.addEventListener("click", (e) => {
    if (!typeFilterMenu || !typeFilterToggle) return;
    if (!typeFilterMenu.contains(e.target) && !typeFilterToggle.contains(e.target)) closeTypeFilterMenu();
  });
  typeFilterMenu?.addEventListener("click", (e) => {
    const item = e.target.closest(".type-filter-item");
    if (!item) return;
    const t = String(item.dataset.type || "").toLowerCase();
    if (!VALID_TYPE_FILTERS.includes(t)) return;
    if (selectedTypeFilters.has(t)) selectedTypeFilters.delete(t);
    else selectedTypeFilters.add(t);
    persistTypeFilter();
    refreshTypeFilterUI();
    renderCharacters(searchInput?.value || "");
  });
  typeFilterClear?.addEventListener("click", () => {
    if (!selectedTypeFilters.size) return;
    selectedTypeFilters.clear();
    persistTypeFilter();
    refreshTypeFilterUI();
    renderCharacters(searchInput?.value || "");
  });


  const ISLAND_DATA_URL = "data/db-gather-island.json";
  let islandDataCache = null;

  const islandItems = [
    { key: "rainbow fruit tree", dataKey: "gemTree" },

    { key: "monument of ferocity", dataKey: "monumentOfFerocity" },
    { key: "guiding mine", dataKey: "guidingMine" },

    { key: "monument of endurance", dataKey: "monumentOfEndurance" },
    { key: "treasure hunters", dataKey: "treasureHunters" },

    { key: "monument of healing", dataKey: "monumentOfHealing" },
    { key: "fishing spot", dataKey: "fishingSpot" },

    { key: "meat roaster", dataKey: "meatRoaster" },
    { key: "training ground", dataKey: "trainingGround" },
    { key: "spring of vitality", dataKey: "springOfVitality" },
    { key: "berry cave", dataKey: "berryCave" }
  ];

  const islandCalcGroupOrder = {
    "monument of ferocity": 0,
    "monument of endurance": 1,
    "monument of healing": 2,
    "guiding mine": 10,
    "treasure hunters": 11,
    "fishing spot": 12,
    "rainbow fruit tree": 13,
    "meat roaster": 20,
    "training ground": 21,
    "spring of vitality": 22,
    "berry cave": 23
  };

  const islandMaxSteps = [
    { level: 5, img: "grade_none.png", label: "None" },
    { level: 10, img: "copper_1.png", label: "Copper 1" },
    { level: 20, img: "silver_1.png", label: "Silver 1" },
    { level: 25, img: "silver_3.png", label: "Silver 3" },
    { level: 30, img: "platina_1.png", label: "Platina 1" },
    { level: 31, img: "platina_3.png", label: "Platina 3" },
    { level: 33, img: "platina_4.png", label: "Platina 4" },
    { level: 35, img: "red_1.png", label: "Red 1" }
  ];

  function renderIslandMaxPanel() {
    if (!islandMaxList) return;
    islandMaxList.innerHTML = "";
    islandMaxSteps.forEach((step) => {
      const row = document.createElement("div");
      row.className = "island-max-row";

      const level = document.createElement("div");
      level.className = "island-max-level";
      level.textContent = `Level ${step.level}`;

      const img = document.createElement("img");
      img.className = "island-max-img";
      img.src = `assets/island/${step.img}`;
      img.alt = step.label;
      img.loading = "lazy";

      row.append(level, img);
      islandMaxList.appendChild(row);
    });
  }

  function openIslandMaxPanel() {
    if (!islandMaxPanel) return;
    renderIslandMaxPanel();
    islandMaxPanel.hidden = false;
    islandInfoBtn?.setAttribute("aria-expanded", "true");
  }

  function closeIslandMaxPanel() {
    if (!islandMaxPanel) return;
    islandMaxPanel.hidden = true;
    islandInfoBtn?.setAttribute("aria-expanded", "false");
  }

  function calcIslandTickets(itemData, fromLevel, toLevel) {
    const start = Number(fromLevel);
    const end = Number(toLevel);
    if (!itemData || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) return 0;
    let total = 0;
    for (let lvl = start; lvl < end; lvl += 1) {
      const c = Number(itemData?.levels?.[lvl]?.cost);
      if (Number.isFinite(c) && c > 0) total += c;
    }
    return total;
  }

  function formatIslandCalcNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n)) return "0";
    return n.toLocaleString("fr-FR");
  }

  function renderIslandCalcPanel() {
    if (!islandCalcList || !islandCalcTotal) return;
    const levels = readIslandLevels();
    ensureIslandData().then((db) => {
      islandCalcList.innerHTML = "";
      const metaMap = new Map();
      const calcItems = [...islandItems].sort((a, b) => {
        const ga = islandCalcGroupOrder[a.key] ?? 99;
        const gb = islandCalcGroupOrder[b.key] ?? 99;
        if (ga !== gb) return ga - gb;
        return a.key.localeCompare(b.key);
      });
      calcItems.forEach((item) => {
        const data = db?.[item.dataKey];
        const maxLevel = 35;
        const current = Math.max(1, Math.min(maxLevel, Number(levels[item.key] ?? 1)));
        const isMax = current >= maxLevel;
        const minTarget = current;
        metaMap.set(item.key, { data, current, maxLevel, minTarget, name: data?.title || item.key });

        const row = document.createElement("div");
        row.className = "island-calc-row";
        row.dataset.key = item.key;
        if (isMax) {
          row.classList.add("is-max");
          row.setAttribute("aria-disabled", "true");
        }

        const head = document.createElement("div");
        head.className = "island-calc-head";
        const name = document.createElement("img");
        name.className = "island-calc-logo";
        name.src = `assets/island/${item.key}.png`;
        name.alt = data?.title || item.key;
        name.decoding = "async";
        name.loading = "lazy";
        name.title = data?.title || item.key;
        const info = document.createElement("div");
        info.className = "island-calc-meta";
        info.textContent = `Current: ${current} / ${maxLevel}`;
        head.append(name, info);

        const controls = document.createElement("div");
        controls.className = "island-calc-controls";
        const target = document.createElement("input");
        target.type = "number";
        target.className = "island-calc-target";
        target.min = String(minTarget);
        target.max = String(maxLevel);
        target.step = "1";
        target.inputMode = "numeric";
        target.pattern = "[0-9]*";
        target.value = String(current);

        const toMax = document.createElement("button");
        toMax.type = "button";
        toMax.className = "island-calc-max-btn";
        toMax.textContent = "MAX";

        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "island-calc-reset-btn";
        resetBtn.textContent = "↺";
        resetBtn.setAttribute("aria-label", "Reset to current level");
        resetBtn.title = "Reset to current level";

        const subtotal = document.createElement("div");
        subtotal.className = "island-calc-subtotal";
        subtotal.textContent = isMax ? "MAX" : "0";

        controls.append(target, toMax, resetBtn, subtotal);
        row.append(head, controls);
        islandCalcList.appendChild(row);

        if (isMax) {
          target.disabled = true;
          toMax.disabled = true;
          resetBtn.disabled = true;
        }
      });

      const refreshTotals = (normalizeInputs = true) => {
        let grand = 0;
        islandCalcList.querySelectorAll(".island-calc-row").forEach((row) => {
          const key = row.dataset.key || "";
          const meta = metaMap.get(key);
          if (!meta) return;
          const input = row.querySelector(".island-calc-target");
          const sub = row.querySelector(".island-calc-subtotal");
          if (!input || !sub) return;
          if (meta.current >= meta.maxLevel) {
            sub.textContent = "MAX";
            return;
          }
          const digits = String(input.value ?? "").replace(/\D+/g, "");
          let target = Number(digits);
          if (!Number.isFinite(target)) target = meta.minTarget;
          target = Math.max(meta.minTarget, Math.min(meta.maxLevel, Math.round(target)));
          if (normalizeInputs) input.value = String(target);
          const total = calcIslandTickets(meta.data, meta.current, target);
          grand += total;
          sub.textContent = formatIslandCalcNumber(total);
        });
        islandCalcTotal.textContent = formatIslandCalcNumber(grand);
      };

      islandCalcList.querySelectorAll(".island-calc-row").forEach((row) => {
        const input = row.querySelector(".island-calc-target");
        const maxBtn = row.querySelector(".island-calc-max-btn");
        const resetBtn = row.querySelector(".island-calc-reset-btn");
        const key = row.dataset.key || "";
        const meta = metaMap.get(key);
        if (!input || !meta) return;
        input.addEventListener("input", () => {
          const sanitized = String(input.value ?? "").replace(/\D+/g, "");
          if (input.value !== sanitized) input.value = sanitized;
          refreshTotals(false);
        });
        input.addEventListener("blur", () => refreshTotals(true));
        input.addEventListener("change", () => refreshTotals(true));
        maxBtn?.addEventListener("click", () => {
          input.value = String(meta.maxLevel);
          refreshTotals(true);
        });
        resetBtn?.addEventListener("click", () => {
          input.value = String(meta.current);
          refreshTotals(true);
        });
      });

      refreshTotals(true);
    });
  }

  function openIslandCalcPanel() {
    if (!islandCalcPanel) return;
    renderIslandCalcPanel();
    islandCalcPanel.hidden = false;
    if (window.matchMedia?.("(max-width: 620px)")?.matches) {
      islandCalcList?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    }
    islandCalcBtn?.setAttribute("aria-expanded", "true");
  }

  function closeIslandCalcPanel() {
    if (!islandCalcPanel) return;
    islandCalcPanel.hidden = true;
    islandCalcBtn?.setAttribute("aria-expanded", "false");
  }

  function formatIslandDesc(itemData, levelIndex) {
    if (!itemData) return "";
    const desc = itemData.description || "";
    const lvlValue = itemData.levels?.[levelIndex]?.value;

    const formatValue = (v) => {
      if (v && typeof v === "object") {
        return `Super: ${v.superSuccess}%, Success: ${v.success}%, Fail: ${v.failure}%`;
      }
      return v;
    };

    const lvlText = desc.replace("{value}", `<span class="island-val">${formatValue(lvlValue)}</span>`)
      .replace("{superSuccess}", `<span class="island-val">${lvlValue?.superSuccess}</span>`)
      .replace("{success}", `<span class="island-val">${lvlValue?.success}</span>`)
      .replace("{failure}", `<span class="island-val">${lvlValue?.failure}</span>`);
    return `<strong>Level ${levelIndex + 1}:</strong> ${lvlText}`;
  }

  function ensureIslandData() {
    if (islandDataCache) return Promise.resolve(islandDataCache);
    return fetch(ISLAND_DATA_URL)
      .then((r) => r.json())
      .then((data) => {
        islandDataCache = data || {};
        return islandDataCache;
      })
      .catch(() => ({}));
  }

  function readIslandLevels() {
    try {
      const raw = localStorage.getItem(ISLAND_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch { return {}; }
  }
  function saveIslandLevels(levels) {
    localStorage.setItem(ISLAND_KEY, JSON.stringify(levels || {}));
  }

  function renderIslandPanel() {
    if (!islandGrid) return;
    islandGrid.innerHTML = "";
    const levels = readIslandLevels();
    ensureIslandData().then((db) => {
      islandGrid.innerHTML = "";
      islandItems.forEach((item) => {
        const data = db?.[item.dataKey];
        const maxLevel = data?.levels?.length || 35;

        const row = document.createElement("div");
        row.className = "island-item";
        row.dataset.key = item.key;
        if (item.key === "rainbow fruit tree") row.classList.add("is-wide");

        const head = document.createElement("button");
        head.type = "button";
        head.className = "island-head";
        head.setAttribute("aria-expanded", "false");

        const label = document.createElement("div");
        label.textContent = data?.title || item.key;

        const meta = document.createElement("div");
        meta.className = "island-meta";

        const status = document.createElement("div");
        status.className = "island-status";
        const current = Math.max(1, Math.min(maxLevel, Number(levels[item.key] ?? 1)));
        if (current >= maxLevel) {
          const maxImg = document.createElement("img");
          maxImg.src = "assets/island/lv_max.png";
          maxImg.alt = "MAX";
          maxImg.className = "island-status-max";
          status.appendChild(maxImg);
        } else {
          status.textContent = `${current}/${maxLevel}`;
        }

        const img = document.createElement("img");
        img.className = "island-icon";
        img.src = `assets/island/${item.key}.png`;
        img.alt = data?.title || item.key;
        img.onerror = () => { img.src = PLACEHOLDER_IMG; };

        const costInline = document.createElement("div");
        costInline.className = "island-head-cost";
        const costValue = data?.levels?.[current]?.cost;
        costInline.innerHTML = (costValue === undefined || costValue === null)
          ? ""
          : `<img src="assets/island/pvp ticket.png" alt="" /><span>${costValue}</span>`;

        meta.append(status, img);
        head.append(label, costInline, meta);

        const body = document.createElement("div");
        body.className = "island-body";
        body.hidden = true;

        const desc = document.createElement("div");
        desc.className = "island-desc";
        desc.innerHTML = formatIslandDesc(data, Math.max(0, current - 1));

        const slider = document.createElement("div");
        slider.className = "island-slider";

        const range = document.createElement("input");
        range.type = "range";
        range.min = "1";
        range.max = String(maxLevel);
        range.value = String(current);

        const value = document.createElement("div");
        value.className = "island-value";
        value.textContent = `${current}/${maxLevel}`;

        function updateRangeFill() {
          const v = Number(range.value);
          const min = Number(range.min) || 0;
          const max = Number(range.max) || 1;
          const denom = Math.max(1, max - min);
          const pct = Math.max(0, Math.min(100, ((v - min) / denom) * 100));
          range.style.background = `linear-gradient(90deg, #D79A4C 0%, #8F5123 ${pct}%, #1b1b1b ${pct}%, #1b1b1b 100%)`;
        }
        updateRangeFill();

        range.addEventListener("input", () => {
          const v = Number(range.value);
          value.textContent = v >= maxLevel ? "MAX" : `${v}/${maxLevel}`;
          status.textContent = "";
          if (v >= maxLevel) {
            const maxImg = document.createElement("img");
            maxImg.src = "assets/island/lv_max.png";
            maxImg.alt = "MAX";
            maxImg.className = "island-status-max";
            status.appendChild(maxImg);
          } else {
            status.textContent = `${v}/${maxLevel}`;
          }
          levels[item.key] = v;
          saveIslandLevels(levels);
          updateRangeFill();
          desc.innerHTML = formatIslandDesc(data, Math.max(0, v - 1));
          const nextCostValue = data?.levels?.[v]?.cost;
          costInline.innerHTML = (nextCostValue === undefined || nextCostValue === null)
            ? ""
            : `<img src="assets/island/pvp ticket.png" alt="" /><span>${nextCostValue}</span>`;
          if (islandCalcPanel && !islandCalcPanel.hidden) renderIslandCalcPanel();
        });

        slider.append(range, value);
        body.append(desc, slider);

        head.addEventListener("click", () => {
          const isOpen = !row.classList.contains("is-open");
          islandGrid.querySelectorAll(".island-item").forEach((el) => {
            el.classList.remove("is-open");
            if (el.classList.contains("is-wide")) el.classList.remove("is-wide");
            const b = el.querySelector(".island-body");
            const h = el.querySelector(".island-head");
            if (b) b.hidden = true;
            if (h) h.setAttribute("aria-expanded", "false");
          });
          if (isOpen) {
            row.classList.add("is-open");
            body.hidden = false;
            head.setAttribute("aria-expanded", "true");
          } else {
            const rainbow = islandGrid.querySelector('.island-item[data-key="rainbow fruit tree"]');
            if (rainbow) rainbow.classList.add("is-wide");
          }
        });

        row.append(head, body);
        islandGrid.appendChild(row);
      });
    });
  }

  function openIslandPanel() {
    renderIslandPanel();
    closeIslandMaxPanel();
    closeIslandCalcPanel();
    openPanel(islandPanel, islandToggle);
    if (window.matchMedia?.("(max-width: 620px)")?.matches) {
      islandContent?.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
    }
  }

  function closeIslandPanel() {
    closeIslandMaxPanel();
    closeIslandCalcPanel();
    closePanel(islandPanel, islandToggle);
  }

  islandToggle?.addEventListener("click", () => {
    closeEditPanel();
    deactivateSelectionMode();
    openIslandPanel();
  });
  islandClose?.addEventListener("click", closeIslandPanel);
  islandPanel?.addEventListener("click", (e) => {
    if (!e.target.closest(".fp-dialog")) closeIslandPanel();
  });
  islandInfoBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!islandMaxPanel) return;
    if (islandMaxPanel.hidden) openIslandMaxPanel();
    else closeIslandMaxPanel();
  });
  islandCalcBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!islandCalcPanel) return;
    if (islandCalcPanel.hidden) {
      if (islandMaxPanel && !islandMaxPanel.hidden) closeIslandMaxPanel();
      openIslandCalcPanel();
    }
    else closeIslandCalcPanel();
  });
  document.addEventListener("click", (e) => {
    if (!islandMaxPanel || islandMaxPanel.hidden) return;
    const inPanel = e.target.closest("#island-max-panel");
    const inButton = e.target.closest("#island-info");
    if (!inPanel && !inButton) closeIslandMaxPanel();
  });
  document.addEventListener("click", (e) => {
    if (!islandCalcPanel || islandCalcPanel.hidden) return;
    const inPanel = e.target.closest("#island-calc-panel");
    const inButton = e.target.closest("#island-calc");
    if (!inPanel && !inButton) closeIslandCalcPanel();
  });

  // Initial load
  syncCatalogOwnershipToggle();
  loadCharacters().then(() => {
    setActiveCatalogPage(activeCatalogPage);
  });


  // Global Escape close
  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (lightboxEl && !lightboxEl.classList.contains("hidden")) {
      closeLightbox();
      return;
    }
    if (settingsResetDialog && !settingsResetDialog.hidden) {
      closeSettingsResetDialog();
      return;
    }
    if (editPanel && !editPanel.hidden) {
      closeEditPanel({ deactivateMode: true });
      return;
    }
    if (settingsPanel && !settingsPanel.hidden) closePanel(settingsPanel, settingsToggle);
    if (islandPanel && !islandPanel.hidden) closeIslandPanel();
  });

  // Header shadow on scroll
  const topBar = document.getElementById("top-bar");
  const bottomBar = document.getElementById("bottom-bar");
  const mainEl = document.querySelector("main");
  const updateTopBarShadow = () => {
    if (topBar) topBar.classList.toggle("is-scrolled", window.scrollY > 8);
    if (bottomBar) {
      const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 8;
      bottomBar.classList.toggle("is-scrolled", !atBottom);
    }
  };
  const updateBarHeights = () => {
    const root = document.documentElement;
    if (topBar) root.style.setProperty("--top-bar-height", `${topBar.offsetHeight}px`);
    if (bottomBar) root.style.setProperty("--bottom-bar-height", `${bottomBar.offsetHeight}px`);
  };
  const applyDynamicMainPadding = () => {
    if (!mainEl) return;
    mainEl.style.setProperty("--content-margin", "6px");
  };
  window.addEventListener("scroll", updateTopBarShadow, { passive: true });
  window.addEventListener("resize", () => {
    updateTopBarShadow();
    updateBarHeights();
    applyDynamicMainPadding();
  }, { passive: true });
  window.addEventListener("load", () => {
    updateBarHeights();
    applyDynamicMainPadding();
  }, { passive: true });
  updateBarHeights();
  applyDynamicMainPadding();
  updateTopBarShadow();
})();






(() => {
  const btn = document.getElementById("scroll-top-btn");
  if (!btn) return;
  const scroller = document.querySelector("main") || document.scrollingElement || window;
  const getY = () => (scroller === window ? window.scrollY : scroller.scrollTop);
  const onScroll = () => {
    btn.classList.toggle("is-visible", getY() > 300);
  };
  scroller.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", () => {
    if (scroller === window) window.scrollTo({ top: 0, behavior: "smooth" });
    else scroller.scrollTo({ top: 0, behavior: "smooth" });
  });
  onScroll();
})();
