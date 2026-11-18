import { app } from "../../scripts/app.js";

const NODE_TYPE = "CameraComposition100";
const HEIGHTS = [
    { value: "low", label: "하단" },
    { value: "mid", label: "중간" },
    { value: "high", label: "상단" },
];
const PANEL_HEIGHT = 260;
const PROMPT_STORAGE_KEY = "HealingArty.CameraComposition100.savedPrompts";
const MODES = [
    { label: "랜덤", value: "랜덤 · random", api: "random", seedControl: "randomize", hint: "실행할 때마다 새 시드로 구도를 고릅니다." },
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

function addModePanel(node, modeWidget, indexWidget, presets) {
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

    let height = "mid";
    let renderedHeight;
    let previousFixedIndex;
    const heightButtons = HEIGHTS.map(({ value, label }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = label;
        button.addEventListener("click", () => {
            height = value;
            refresh();
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

        const placeholder = new Option("앵글 목록에서 선택", "");
        placeholder.disabled = true;
        const options = presets.filter((preset) => preset.height === height).map((preset) =>
            new Option(`#${String(preset.id).padStart(2, "0")} · ${preset.title}`, preset.id)
        );
        select.replaceChildren(placeholder, ...options);
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

    select.addEventListener("change", () => {
        setWidget(node, indexWidget, Number(select.value));
        applyMode(MODES[2]);
    });

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
        if (fixedPreset && (restoring || fixedIndex !== previousFixedIndex)) {
            height = fixedPreset.height;
        }
        previousFixedIndex = fixedIndex;
        renderHeight();

        const selected = fixedPreset?.height === height ? String(fixedIndex) : "";
        if (select.value !== selected) select.value = selected;
        const message = current?.api === "random" && seedControl?.value !== "randomize"
            ? "같은 시드를 사용하면 같은 구도가 선택됩니다."
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
    // Keep the native value widget in the workflow and API serialization.
    modeWidget.type = "hidden";
    modeWidget.computeSize = () => [0, -4];
    modeWidget.draw = () => {};
    refresh();
    return () => refresh(true);
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
            if (mode && index && presets?.length && this.addDOMWidget) {
                this.refreshHealingArtyMode = addModePanel(this, mode, index, presets);
                const [width, height] = this.computeSize();
                this.setSize([Math.max(390, width), Math.max(530, height)]);
            }
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
