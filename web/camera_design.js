import { app } from "../../scripts/app.js";

const NODE_TYPE = "CameraComposition100";
const HEIGHTS = [
    { value: "all", label: "전체" },
    { value: "low", label: "하단" },
    { value: "mid", label: "중간" },
    { value: "high", label: "상단" },
];
const PANEL_HEIGHT = 320;
const PROMPT_STORAGE_KEY = "HealingArty.CameraComposition100.savedPrompts";
const MODES = [
    { label: "랜덤", value: "랜덤 · random", api: "random", seedControl: "randomize", hint: "" },
    { label: "순차", value: "순차 · sequential", api: "sequential", seedControl: "increment", hint: "시드 0부터 시작하면 01 → 100 순서로 촬영합니다." },
    { label: "고정", value: "고정 · fixed", api: "fixed", seedControl: "fixed", hint: "목록에서 고른 앵글을 사용합니다." },
];

function setWidget(node, widget, value) {
    const previous = widget.value;
    widget.value = value;
    widget.callback?.(value);
    node.onWidgetChanged?.(widget.name, value, previous, widget);
}

function addSavedPrompts(node, panel, baseWidget, poseWidget) {
    const section = document.createElement("section");
    section.className = "ha-camera-saved-prompts";
    section.setAttribute("aria-label", "저장한 프롬프트");

    const saveRow = document.createElement("div");
    const name = document.createElement("input");
    name.type = "text";
    name.placeholder = "프롬프트 저장 이름";
    name.setAttribute("aria-label", name.placeholder);
    const save = document.createElement("button");
    save.type = "button";
    save.textContent = "저장";
    saveRow.append(name, save);

    const loadRow = document.createElement("div");
    const list = document.createElement("select");
    list.setAttribute("aria-label", "저장한 프롬프트 목록");
    const load = document.createElement("button");
    load.type = "button";
    load.textContent = "불러오기";
    loadRow.append(list, load);

    const status = document.createElement("div");
    status.className = "ha-camera-mode-hint";
    status.setAttribute("role", "status");
    section.append(saveRow, loadRow, status);
    panel.append(section);

    function readPrompts() {
        return new Map(JSON.parse(localStorage.getItem(PROMPT_STORAGE_KEY) ?? "[]"));
    }

    function refreshList(selected = list.value) {
        try {
            const placeholder = new Option("저장한 프롬프트 선택", "");
            const options = [...readPrompts().keys()].map((key) => new Option(key, key));
            list.replaceChildren(placeholder, ...options);
            list.value = options.some((option) => option.value === selected) ? selected : "";
        } catch {
            status.textContent = "저장한 프롬프트 목록을 읽을 수 없습니다.";
        }
    }

    function hasLinkedPrompt() {
        return node.inputs?.some((input) => input.name === "base_prompt" && input.link != null);
    }

    save.addEventListener("click", () => {
        const key = name.value.trim();
        if (!key || hasLinkedPrompt()) {
            status.textContent = !key ? "저장할 이름을 입력하세요." : "연결된 프롬프트 대신 노드에 직접 입력한 값을 저장할 수 있습니다.";
            return;
        }
        try {
            const prompts = readPrompts();
            if (prompts.has(key) && !window.confirm(`“${key}” 프롬프트를 덮어쓸까요?`)) return;
            prompts.set(key, { prompt: baseWidget.value, pose: poseWidget.value });
            localStorage.setItem(PROMPT_STORAGE_KEY, JSON.stringify([...prompts]));
            refreshList(key);
            status.textContent = "프롬프트와 자세를 저장했습니다.";
        } catch {
            status.textContent = "프롬프트를 저장할 수 없습니다.";
        }
    });

    load.addEventListener("click", () => {
        if (!list.value || hasLinkedPrompt()) {
            status.textContent = list.value ? "불러오려면 base_prompt 입력 연결을 해제하세요." : "불러올 프롬프트를 선택하세요.";
            return;
        }
        try {
            const entry = readPrompts().get(list.value);
            if (typeof entry?.prompt !== "string" || typeof entry.pose !== "string") {
                refreshList();
                status.textContent = "저장한 프롬프트를 찾을 수 없습니다.";
                return;
            }
            setWidget(node, baseWidget, entry.prompt);
            setWidget(node, poseWidget, entry.pose);
            node.graph?.change?.();
            node.setDirtyCanvas?.(true, true);
            status.textContent = "프롬프트와 자세를 불러왔습니다.";
        } catch {
            status.textContent = "프롬프트를 불러올 수 없습니다.";
        }
    });

    list.addEventListener("focus", () => refreshList());
    refreshList();
}

function addModePanel(node, modeWidget, indexWidget, scopeWidget, presets) {
    const panel = document.createElement("section");
    panel.className = "ha-camera-mode-panel";
    panel.setAttribute("aria-label", "카메라 프리셋 선택 방식");

    const row = document.createElement("div");
    row.className = "ha-camera-mode-row";
    panel.append(row);

    const hint = document.createElement("div");
    hint.className = "ha-camera-mode-hint";
    panel.append(hint);

    const heightRow = document.createElement("div");
    heightRow.className = "ha-camera-mode-row ha-camera-height-row";
    heightRow.setAttribute("role", "group");
    heightRow.setAttribute("aria-label", "촬영 높이");
    panel.append(heightRow);

    const picker = document.createElement("label");
    picker.className = "ha-camera-preset-picker";
    const caption = document.createElement("span");
    caption.textContent = "카메라 앵글";
    const select = document.createElement("select");
    picker.append(caption, select);
    panel.append(picker);

    const lastResult = document.createElement("div");
    lastResult.className = "ha-camera-last-result";
    const lastLabel = document.createElement("strong");
    lastLabel.textContent = "마지막 앵글";
    const lastInfo = document.createElement("div");
    lastInfo.className = "ha-camera-mode-hint";
    lastInfo.setAttribute("role", "status");
    lastInfo.textContent = "실행하면 여기에 표시됩니다.";
    const pin = document.createElement("button");
    pin.type = "button";
    pin.textContent = "이 앵글 고정";
    pin.disabled = true;
    lastResult.append(lastLabel, pin, lastInfo);
    panel.append(lastResult);

    let lastPreset;

    let height;
    let renderedHeight;
    let previousFixedIndex;
    const heightButtons = HEIGHTS.map(({ value, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
            setWidget(node, scopeWidget, height === value ? "all" : value);
            height = scopeWidget.value;
            refresh();
            node.graph?.change?.();
            node.setDirtyCanvas?.(true, true);
        });
        heightRow.append(button);
        return button;
    });

    function renderHeight() {
        if (height === renderedHeight) return;
        renderedHeight = height;
        heightButtons.forEach((button, index) => {
            button.setAttribute("aria-pressed", String(HEIGHTS[index].value === height));
        });

        const placeholder = new Option(height === "all" ? "높이를 고르면 앵글 목록이 열립니다" : "앵글 목록에서 선택", "");
        placeholder.disabled = true;
        const options = presets.filter((preset) => preset.height === height).map((preset) =>
            new Option(`#${String(preset.id).padStart(2, "0")} · ${preset.title}`, preset.id)
        );
        select.replaceChildren(placeholder, ...options);
        select.disabled = height === "all";
    }

    const seedWidget = node.widgets.find((widget) => widget.name === "seed");
    const seedControl = seedWidget?.linkedWidgets?.find((widget) => widget.name === "control_after_generate")
        ?? node.widgets.find((widget) => widget.name === "control_after_generate");

    function applyMode(mode) {
        setWidget(node, modeWidget, mode.value);
        if (seedControl?.options?.values?.includes(mode.seedControl)) {
            seedControl.value = mode.seedControl;
            seedControl.callback?.(mode.seedControl);
        }
        refresh();
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
    }

    function fixPreset(id) {
        setWidget(node, indexWidget, id);
        applyMode(MODES[2]);
    }

    select.addEventListener("change", () => fixPreset(Number(select.value)));
    pin.addEventListener("click", () => {
        if (lastPreset) fixPreset(lastPreset.id);
    });

    node.updateHealingArtyLastAngle = (output) => {
        const id = output?.camera_preset_id?.at(-1);
        const preset = presets.find((entry) => entry.id === id);
        if (!preset) return;

        lastPreset = preset;
        lastInfo.textContent = output.camera_selected_info?.at(-1)
            ?? `#${String(id).padStart(2, "0")} · ${preset.title}`;
        lastInfo.title = lastInfo.textContent;
        refresh();
    };

    const buttons = MODES.map((mode) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode.label;
        button.addEventListener("click", () => applyMode(mode));
        row.append(button);
        return button;
    });

    function refresh(restoring = false) {
        const active = MODES.findIndex(({ value, api }) => [value, api].includes(modeWidget.value));
        buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === active)));
        const current = MODES[active];
        const fixedIndex = current?.api === "fixed" ? Number(indexWidget.value) : undefined;
        const fixedPreset = presets.find((preset) => preset.id === fixedIndex);
        if (current?.api !== "fixed" || restoring) height = scopeWidget.value;
        if (fixedPreset && (fixedIndex !== previousFixedIndex || (restoring && height === "all"))) {
            height = fixedPreset.height;
        }
        previousFixedIndex = fixedIndex;
        renderHeight();

        const pinned = lastPreset && lastPreset.id === fixedIndex;
        pin.disabled = !lastPreset || Boolean(pinned);
        const pinLabel = pinned ? "고정 중" : "이 앵글 고정";
        if (pin.textContent !== pinLabel) pin.textContent = pinLabel;

        const selected = fixedPreset?.height === height ? String(fixedIndex) : "";
        if (select.value !== selected) select.value = selected;
        const scope = HEIGHTS.find(({ value }) => value === scopeWidget.value);
        const message = current?.api === "random"
            ? `${scope?.label ?? "전체"} 앵글에서 랜덤으로 선택합니다.`
            : current?.hint ?? "";
        if (hint.textContent !== message) hint.textContent = message;
    }

    const base = node.widgets.find((widget) => widget.name === "base_prompt");
    const pose = node.widgets.find((widget) => widget.name === "pose");
    if (base && pose) addSavedPrompts(node, panel, base, pose);

    node.addDOMWidget("camera_mode_panel", "healingarty-camera-panel", panel, {
        serialize: false,
        selectOn: [],
        getMinHeight: () => PANEL_HEIGHT,
        getHeight: () => PANEL_HEIGHT,
        onDraw: () => refresh(),
    });
    // Keep both native values in workflow and API serialization.
    for (const widget of [modeWidget, scopeWidget]) {
        widget.type = "hidden";
        widget.computeSize = () => [0, -4];
        widget.draw = () => {};
    }
    function restore() {
        if (!HEIGHTS.some(({ value }) => value === scopeWidget.value)) scopeWidget.value = "all";
        refresh(true);
    }

    restore();
    return restore;
}

app.registerExtension({
    name: "HealingArty.CameraComposition100",
    setup() {
        const stylesheet = document.createElement("link");
        stylesheet.rel = "stylesheet";
        stylesheet.href = new URL("./camera_design.css", import.meta.url).href;
        document.head.append(stylesheet);
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== NODE_TYPE) return;

        const presets = nodeData.input?.required?.mode?.[1]?.camera_presets;
        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            this.color = "#30343A";
            this.bgcolor = "#222222";

            const mode = this.widgets?.find((widget) => widget.name === "mode");
            const index = this.widgets?.find((widget) => widget.name === "preset_index");
            const scope = this.widgets?.find((widget) => widget.name === "random_height");
            if (mode && index && scope && presets?.length && this.addDOMWidget) {
                this.refreshHealingArtyMode = addModePanel(this, mode, index, scope, presets);
                const [width, height] = this.computeSize();
                this.setSize([Math.max(390, width), Math.max(590, height)]);
            }
            return result;
        };

        const onExecuted = nodeType.prototype.onExecuted;
        nodeType.prototype.onExecuted = function (output) {
            const result = onExecuted?.apply(this, arguments);
            this.updateHealingArtyLastAngle?.(output);
            return result;
        };

        const onConfigured = nodeType.prototype.onConfigure;
        nodeType.prototype.onConfigure = function () {
            const result = onConfigured?.apply(this, arguments);
            this.refreshHealingArtyMode?.();
            return result;
        };
    },
});
