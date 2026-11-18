import { app } from "../../scripts/app.js";

const NODE_TYPE = "CameraComposition100";
const HEIGHTS = [
    { value: "low", label: "하단" },
    { value: "mid", label: "중간" },
    { value: "high", label: "상단" },
];
const PANEL_HEIGHT = 152;
const MODES = [
    { label: "랜덤", value: "랜덤 · random", api: "random", seedControl: "randomize", hint: "실행할 때마다 새 시드로 구도를 고릅니다." },
    { label: "순차", value: "순차 · sequential", api: "sequential", seedControl: "increment", hint: "시드 0부터 시작하면 01 → 100 순서로 촬영합니다." },
    { label: "고정", value: "고정 · fixed", api: "fixed", seedControl: "fixed", hint: "목록에서 고른 앵글을 사용합니다." },
];

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

    function setWidget(widget, value) {
        const previous = widget.value;
        widget.value = value;
        widget.callback?.(value);
        node.onWidgetChanged?.(widget.name, value, previous, widget);
    }

    function applyMode(mode) {
        setWidget(modeWidget, mode.value);
        if (seedControl?.options?.values?.includes(mode.seedControl)) {
            seedControl.value = mode.seedControl;
            seedControl.callback?.(mode.seedControl);
        }
        refresh();
        node.graph?.change?.();
        node.setDirtyCanvas?.(true, true);
    }

    select.addEventListener("change", () => {
        setWidget(indexWidget, Number(select.value));
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
                this.setSize([Math.max(390, width), Math.max(396, height)]);
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
