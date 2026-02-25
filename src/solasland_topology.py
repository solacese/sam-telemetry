#!/usr/bin/env python3
from __future__ import annotations

import bisect
import re
from typing import Iterator

TOTAL_AGENTS = 1000
ORCHESTRATOR_COUNT = 1
HEAD_COUNT = 10
MANAGER_COUNT = 100
CITIZEN_COUNT = 889
MANAGERS_PER_HEAD = 10

HEADS: list[tuple[str, str]] = [
    ("research", "Head of Research"),
    ("government", "Head of Government"),
    ("education", "Head of Education"),
    ("healthcare", "Head of Healthcare"),
    ("infrastructure", "Head of Infrastructure"),
    ("media", "Head of Media"),
    ("legal_ethics", "Head of Legal & Ethics"),
    ("companies", "Head of Companies"),
    ("math", "Head of Mathematics"),
    ("operations", "Head of Operations"),
]

HEAD_IDS = [f"solasland_head_{institution}" for institution, _ in HEADS]

MANAGER_BASE_CITIZENS = CITIZEN_COUNT // MANAGER_COUNT
MANAGERS_WITH_EXTRA_CITIZEN = CITIZEN_COUNT % MANAGER_COUNT

MANAGER_ID_RE = re.compile(r"^solasland_manager_(\d{3})$")
CITIZEN_ID_RE = re.compile(r"^solasland_citizen_(\d{5})$")

MANAGER_GIVEN_NAMES = [
    "Ava", "Liam", "Noah", "Emma", "Mason", "Sophia", "Lucas", "Mia", "Ethan", "Amelia",
    "James", "Isabella", "Henry", "Charlotte", "Logan", "Evelyn", "Elijah", "Harper", "Leo", "Ella",
    "Benjamin", "Nora", "Jack", "Avery", "Owen", "Sofia", "Samuel", "Camila", "Daniel", "Aria",
    "Julian", "Scarlett",
]

MANAGER_FAMILY_NAMES = [
    "Anderson", "Bennett", "Campbell", "Delgado", "Ellis", "Foster", "Garcia", "Hayes", "Ibrahim", "Jensen",
    "Khan", "Lopez", "Mitchell", "Nguyen", "Owens", "Patel", "Quinn", "Ramirez", "Silva", "Turner",
    "Usman", "Vargas", "Walker", "Xu", "Young", "Zimmerman", "Brooks", "Carter", "Diaz", "Evans",
    "Flores", "Gomez", "Howard", "Ivanov", "Jordan", "Kim", "Larson",
]

CITIZEN_GIVEN_NAMES = [
    "Ari", "Bea", "Cai", "Dara", "Elio", "Faye", "Gio", "Hana", "Ivo", "Juna",
    "Kai", "Lena", "Milo", "Nia", "Oren", "Pia", "Quin", "Rhea", "Soren", "Tala",
    "Uma", "Vin", "Wren", "Xavi", "Yara", "Zane", "Aiden", "Bianca", "Colin", "Daphne",
    "Elias", "Freya", "Gavin", "Hazel", "Ivan", "Jade", "Keira", "Levi", "Mina", "Nolan", "Opal",
]

CITIZEN_MIDDLE_NAMES = [
    "Alex", "Blair", "Casey", "Dev", "Emerson", "Finley", "Gray", "Hayden", "Indra", "Jules",
    "Kai", "Lane", "Marin", "Noel", "Oak", "Parker", "Quill", "Reese", "Shay", "Tobin",
    "Urban", "Vale", "Winter", "Xen", "Yael", "Zev", "Arden", "Bryn", "Cove", "Drew",
    "Ever", "Flynn", "Glenn", "Hollis", "Ira", "Joss", "Kade",
]

CITIZEN_FAMILY_NAMES = [
    "Aster", "Brook", "Cinder", "Dawn", "Ember", "Frost", "Gale", "Hollow", "Iris", "Juniper",
    "Kestrel", "Lark", "Meadow", "Nova", "Orchid", "Prism", "Quartz", "River", "Stone", "Thorne",
    "Umbra", "Vale", "Wilder", "Yarrow", "Zephyr", "Briar", "Cloud", "Drift", "Evergreen", "Fern",
    "Grove", "Harbor", "Ivory", "Jet", "Knight", "Lake", "Morrow", "North", "Oakley", "Pine",
    "Reed", "Skye", "Tide",
]

CITIZEN_NAME_SPACE = len(CITIZEN_GIVEN_NAMES) * len(CITIZEN_MIDDLE_NAMES) * len(CITIZEN_FAMILY_NAMES)

_MANAGER_CITIZEN_COUNTS = [
    MANAGER_BASE_CITIZENS + (1 if manager_number <= MANAGERS_WITH_EXTRA_CITIZEN else 0)
    for manager_number in range(1, MANAGER_COUNT + 1)
]

_MANAGER_CITIZEN_STARTS: list[int] = []
_MANAGER_CITIZEN_ENDS: list[int] = []
_running = 0
for count in _MANAGER_CITIZEN_COUNTS:
    _MANAGER_CITIZEN_STARTS.append(_running + 1)
    _running += count
    _MANAGER_CITIZEN_ENDS.append(_running)


def manager_id_from_number(manager_number: int) -> str:
    return f"solasland_manager_{manager_number:03d}"


def citizen_id_from_number(citizen_number: int) -> str:
    return f"solasland_citizen_{citizen_number:05d}"


def _manager_number_from_id(agent_id: str) -> int | None:
    match = MANAGER_ID_RE.match(agent_id)
    if not match:
        return None
    manager_number = int(match.group(1))
    if manager_number < 1 or manager_number > MANAGER_COUNT:
        return None
    return manager_number


def _citizen_number_from_id(agent_id: str) -> int | None:
    match = CITIZEN_ID_RE.match(agent_id)
    if not match:
        return None
    citizen_number = int(match.group(1))
    if citizen_number < 1 or citizen_number > CITIZEN_COUNT:
        return None
    return citizen_number


def is_manager_id(agent_id: str) -> bool:
    return _manager_number_from_id(agent_id) is not None


def is_citizen_id(agent_id: str) -> bool:
    return _citizen_number_from_id(agent_id) is not None


def _manager_name(manager_number: int) -> str:
    given = MANAGER_GIVEN_NAMES[(manager_number * 7 + 3) % len(MANAGER_GIVEN_NAMES)]
    family = MANAGER_FAMILY_NAMES[(manager_number * 11 + 5) % len(MANAGER_FAMILY_NAMES)]
    if manager_number % 4 == 0:
        middle = chr(ord("A") + (manager_number * 5) % 26)
        return f"{given} {middle}. {family}"
    return f"{given} {family}"


def _citizen_name(citizen_number: int) -> str:
    permuted = (((citizen_number - 1) * 8191) + 12345) % CITIZEN_NAME_SPACE

    given_index = permuted % len(CITIZEN_GIVEN_NAMES)
    middle_index = (permuted // len(CITIZEN_GIVEN_NAMES)) % len(CITIZEN_MIDDLE_NAMES)
    family_index = (permuted // (len(CITIZEN_GIVEN_NAMES) * len(CITIZEN_MIDDLE_NAMES))) % len(CITIZEN_FAMILY_NAMES)

    given = CITIZEN_GIVEN_NAMES[given_index]
    middle = CITIZEN_MIDDLE_NAMES[middle_index]
    family = CITIZEN_FAMILY_NAMES[family_index]
    alt_family = CITIZEN_FAMILY_NAMES[
        (family_index + ((citizen_number * 5) % len(CITIZEN_FAMILY_NAMES))) % len(CITIZEN_FAMILY_NAMES)
    ]
    full_family = f"{family}-{alt_family}" if citizen_number % 6 == 0 else family

    return f"{given} {middle} {full_family}"


def _head_for_manager(manager_number: int) -> tuple[str, str, str]:
    head_index = (manager_number - 1) // MANAGERS_PER_HEAD
    institution, title = HEADS[head_index]
    head_id = f"solasland_head_{institution}"
    return institution, title, head_id


def _citizen_manager_mapping(citizen_number: int) -> tuple[int, int]:
    manager_index = bisect.bisect_left(_MANAGER_CITIZEN_ENDS, citizen_number)
    manager_number = manager_index + 1
    start = _MANAGER_CITIZEN_STARTS[manager_index]
    citizen_offset = citizen_number - start + 1
    return manager_number, citizen_offset


def manager_meta(manager_id: str) -> dict | None:
    manager_number = _manager_number_from_id(manager_id)
    if manager_number is None:
        return None

    institution, _, head_id = _head_for_manager(manager_number)
    full_name = _manager_name(manager_number)
    return {
        "id": manager_id,
        "full_name": full_name,
        "role": "manager",
        "institution": institution,
        "skills": ["coordination", "planning", "reporting"],
        "description": f"{full_name} is a manager reporting to {head_id}.",
        "tags": [institution, "manager", "solasland"],
        "tier": "manager",
        "reports_to": head_id,
        "manager_number": manager_number,
    }


def citizen_meta(citizen_id: str) -> dict | None:
    citizen_number = _citizen_number_from_id(citizen_id)
    if citizen_number is None:
        return None

    manager_number, citizen_offset = _citizen_manager_mapping(citizen_number)
    manager_id = manager_id_from_number(manager_number)
    manager = manager_meta(manager_id)
    if manager is None:
        return None

    full_name = _citizen_name(citizen_number)
    return {
        "id": citizen_id,
        "full_name": full_name,
        "role": "citizen",
        "institution": manager["institution"],
        "skills": ["feedback", "local context"],
        "description": f"{full_name} is a citizen reporting to {manager_id}.",
        "tags": [manager["institution"], "citizen", "solasland"],
        "tier": "citizen",
        "reports_to": manager_id,
        "manager_number": manager_number,
        "citizen_number": citizen_number,
        "citizen_offset": citizen_offset,
    }


def iter_managers() -> Iterator[dict]:
    for manager_number in range(1, MANAGER_COUNT + 1):
        manager = manager_meta(manager_id_from_number(manager_number))
        if manager is not None:
            yield manager


def citizens_for_manager(manager_id: str) -> list[dict]:
    manager_number = _manager_number_from_id(manager_id)
    if manager_number is None:
        return []

    start = _MANAGER_CITIZEN_STARTS[manager_number - 1]
    end = _MANAGER_CITIZEN_ENDS[manager_number - 1]

    citizens = []
    for citizen_number in range(start, end + 1):
        citizen = citizen_meta(citizen_id_from_number(citizen_number))
        if citizen is not None:
            citizens.append(citizen)
    return citizens


def topology_metadata() -> dict:
    return {
        "total_agents": TOTAL_AGENTS,
        "orchestrator_count": ORCHESTRATOR_COUNT,
        "head_count": HEAD_COUNT,
        "manager_count": MANAGER_COUNT,
        "citizen_count": CITIZEN_COUNT,
        "managers_per_head": MANAGERS_PER_HEAD,
        "manager_base_citizens": MANAGER_BASE_CITIZENS,
        "managers_with_extra_citizen": MANAGERS_WITH_EXTRA_CITIZEN,
    }
