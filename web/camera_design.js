import { app } from "../../scripts/app.js";

const NODE_TYPE = "CameraComposition100";
const MODES = [
    { label: "랜덤", value: "랜덤 · random", api: "random", seedControl: "randomize", hint: "실행할 때마다 새 시드로 구도를 고릅니다." },
    { label: "순차", value: "순차 · sequential", api: "sequential", seedControl: "increment", hint: "시드 0부터 시작하면 01 → 100 순서로 촬영합니다." },
    { label: "고정", value: "고정 · fixed", api: "fixed", seedControl: "fixed", hint: "preset_index에 지정한 구도를 사용합니다." },
];

function addModePanel(node, modeWidget) {
    const panel = document.createElement("section");
    panel.className = "ha-camera-mode-panel";
    panel.setAttribute("aria-label", "카메라 프리셋 선택 방식");

    const row = document.createElement("div");
    row.className = "ha-camera-mode-row";
    panel.append(row);

    const hint = document.createElement("div");
    hint.className = "ha-camera-mode-hint";
    panel.append(hint);

    const seedWidget = node.widgets.find((widget) => widget.name === "seed");
    const seedControl = seedWidget?.linkedWidgets?.find((widget) => widget.name === "control_after_generate")
        ?? node.widgets.find((widget) => widget.name === "control_after_generate");

    const buttons = MODES.map((mode) => {
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = mode.label;
        button.addEventListener("click", () => {
            const previous = modeWidget.value;
            modeWidget.value = mode.value;
            modeWidget.callback?.(mode.value);
            node.onWidgetChanged?.(modeWidget.name, mode.value, previous, modeWidget);

            if (seedControl?.options?.values?.includes(mode.seedControl)) {
                seedControl.value = mode.seedControl;
                seedControl.callback?.(mode.seedControl);
            }

            refresh();
            node.graph?.change?.();
            node.setDirtyCanvas?.(true, true);
        });
        row.append(button);
        return button;
    });

    function refresh() {
        const active = MODES.findIndex(({ value, api }) => [value, api].includes(modeWidget.value));
        buttons.forEach((button, index) => button.setAttribute("aria-pressed", String(index === active)));
        const current = MODES[active];
        const message = current?.api === "random" && seedControl?.value !== "randomize"
            ? "같은 시드를 사용하면 같은 구도가 선택됩니다."
            : current?.hint ?? "";
        if (hint.textContent !== message) hint.textContent = message;
    }

    node.addDOMWidget("camera_mode_panel", "healingarty-camera-panel", panel, {
        serialize: false,
        selectOn: [],
        getMinHeight: () => 66,
        getHeight: () => 66,
        onDraw: refresh,
    });
    // Keep the native value widget in the workflow and API serialization.
    modeWidget.type = "hidden";
    modeWidget.computeSize = () => [0, -4];
    modeWidget.draw = () => {};
    refresh();
    return refresh;
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

        const onCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function () {
            const result = onCreated?.apply(this, arguments);
            this.color = "#30343A";
            this.bgcolor = "#222222";

            const mode = this.widgets?.find((widget) => widget.name === "mode");
            if (mode && this.addDOMWidget) {
                this.refreshHealingArtyMode = addModePanel(this, mode);
                const [width, height] = this.computeSize();
                this.setSize([Math.max(390, width), Math.max(310, height)]);
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
