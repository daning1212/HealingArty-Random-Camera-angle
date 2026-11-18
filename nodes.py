import json
import random
from pathlib import Path


PRESET_PATH = Path(__file__).with_name("presets_100.json")
PRESET_COUNT = 100
MODE_LABELS = {
    "랜덤 · random": "random",
    "순차 · sequential": "sequential",
    "고정 · fixed": "fixed",
}

HEIGHT_LABELS = {
    "high": "상단 · 하이 앵글",
    "mid": "중간 · 수평 앵글",
    "low": "하단 · 로우 앵글",
}
SHOT_STYLES = {
    "지정 안 함 · none": "",
    "카메라 보기 · direct": "The subject looks directly into the camera lens.",
    "다른 곳 보기 · away": "The subject looks away from the camera toward a point off-frame.",
    "캔디드 샷 · candid": "Use a candid photographic style.",
}


def load_presets():
    with PRESET_PATH.open(encoding="utf-8") as file:
        data = json.load(file)

    if not isinstance(data, list) or len(data) != PRESET_COUNT:
        raise ValueError(f"{PRESET_PATH.name} must contain exactly {PRESET_COUNT} presets.")

    for index, preset in enumerate(data, start=1):
        if (
            not isinstance(preset, dict)
            or type(preset.get("id")) is not int
            or preset["id"] != index
            or preset.get("height") not in HEIGHT_LABELS
            or any(
                not isinstance(preset.get(field), str) or not preset[field].strip()
                for field in ("title", "category", "prompt")
            )
        ):
            raise ValueError(f"Invalid preset at position {index} in {PRESET_PATH.name}.")

    return tuple(data)


PRESETS = load_presets()


class CameraComposition100:
    CATEGORY = "utils/prompt"
    FUNCTION = "compose"
    RETURN_TYPES = ("STRING", "STRING", "STRING")
    RETURN_NAMES = ("combined_prompt", "camera_preset_only", "selected_info")

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "base_prompt": ("STRING", {"default": "", "multiline": True, "placeholder": "기본 인물 · 의상 · 배경 프롬프트"}),
                "mode": (list(MODE_LABELS), {
                    "tooltip": "랜덤: 시드로 선택 · 순차: 시드 0부터 01~100 반복 · 고정: 목록에서 선택한 앵글 사용",
                    "camera_presets": [
                        {
                            "id": preset["id"],
                            "title": preset["title"],
                            "group": label,
                            "height": height,
                        }
                        for height, label in HEIGHT_LABELS.items()
                        for preset in PRESETS
                        if preset["height"] == height
                    ],
                }),
                "preset_index": ("INT", {"default": 1, "min": 1, "max": PRESET_COUNT}),
                "seed": ("INT", {
                    "default": 0,
                    "min": 0,
                    "max": 0xFFFFFFFFFFFFFFFF,
                    "control_after_generate": True,
                }),
                "position": (["append", "prepend"],),
            },
            "optional": {
                "shot_style": (list(SHOT_STYLES), {"tooltip": "앵글과 별도로 시선 또는 캔디드 촬영 연출을 선택합니다."}),
            },
        }

    @classmethod
    def VALIDATE_INPUTS(cls, mode):
        if MODE_LABELS.get(mode, mode) not in MODE_LABELS.values():
            return f"Unsupported mode: {mode!r}"
        return True

    def compose(self, base_prompt, mode, preset_index, seed, position, shot_style="지정 안 함 · none"):
        mode = MODE_LABELS.get(mode, mode)
        if mode == "random":
            offset = random.Random(seed).randrange(PRESET_COUNT)
        elif mode == "sequential":
            offset = seed % PRESET_COUNT
        elif mode == "fixed":
            if not 1 <= preset_index <= PRESET_COUNT:
                raise ValueError(f"preset_index must be between 1 and {PRESET_COUNT}.")
            offset = preset_index - 1
        else:
            raise ValueError(f"Unsupported mode: {mode!r}")

        preset = PRESETS[offset]
        camera = " ".join(filter(None, (preset["prompt"], SHOT_STYLES[shot_style])))
        base = base_prompt.strip()
        if position == "append":
            parts = (base, camera)
        elif position == "prepend":
            parts = (camera, base)
        else:
            raise ValueError(f"Unsupported position: {position!r}")

        combined = "\n".join(part for part in parts if part)
        if base:
            combined += "\nKeep the pose, body orientation, and action specified in the base prompt."
        info = f"[#{preset['id']:02d} - {preset['title']}] · {preset['category']}"
        return combined, camera, info
