import { BookIcon, ScissorsIcon, SearchIcon, SparklesIcon } from "lucide-react"

export const LAYOUT_DEFINITION = {
    "sidebar_min_width": 240,
    "sidebar_max_width": 640,
    "panel_min_height": 160,
}

export const SEARCH_CONFIG = {
    score_threshold: -1000,
    max_per_type: 4,
}

export const ASSET_TYPES = ["image", "video", "audio", "reference", "naration"] as const

export const LIBRARY_CONFIG = {
  page_size: 32,
}

export const NARATION_CARD_CONFIG = {
  timeline_height: 80,
  pixels_per_second: 12,
  slider_min_scale: 1,
  slider_max_scale: 10,
  slider_width: 170,
  segment_vline: true
}

export const TASK_STAGES = {
    "stages": [
        {
            "id": "script",
            "label": "带货脚本",
            "icon": <BookIcon />,
        },
        {
            "id": "lib",
            // "label": "Library",
            "label": "素材广场",
            "icon": <SearchIcon />,
        },
        {
            "id": "storyboard",
            "label": "构思画板",
            // "label": "Storyboard",
            "icon": <SparklesIcon /> 
        }, 
        {
            "id": "finecut",
            // "label": "FineCut",
            "label": "AI剪辑",
            "icon": <ScissorsIcon />,
        },
    ]
}