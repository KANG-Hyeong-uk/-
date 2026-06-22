"""Pick the right framework converter(s) from a file tree.

We allow multiple converters to run against the same tree (monorepos that
ship both pages/ and app/, or an Astro site with a Remix subpackage). The
orchestrator unions the outputs.
"""

from __future__ import annotations

from .base import FrameworkConverter
from .nextjs import NEXT_CONVERTERS

# Populated as other framework modules come online. Kept as a plain list
# append so the import order doesn't matter.
ALL_CONVERTERS: list[FrameworkConverter] = list(NEXT_CONVERTERS)


def register_converters(converters: list[FrameworkConverter]) -> None:
    """Framework modules call this at import time to register themselves."""
    for c in converters:
        if c not in ALL_CONVERTERS:
            ALL_CONVERTERS.append(c)


def pick_converters(files: list[str]) -> list[FrameworkConverter]:
    """Return every converter whose signature appears in ``files``."""
    return [c for c in ALL_CONVERTERS if c.applies_to(files)]


# Best-effort import of the other framework modules; they self-register
# via register_converters if present. Imports are wrapped so partial
# rollout (e.g. only nextjs.py exists yet) does not break this module.
def _load_optional_converters() -> None:  # pragma: no cover
    for module_name, attr in [
        ("astro", "ASTRO_CONVERTERS"),
        ("sveltekit", "SVELTEKIT_CONVERTERS"),
        ("remix", "REMIX_CONVERTERS"),
    ]:
        try:
            mod = __import__(
                f"app.services.route_extractors.{module_name}",
                fromlist=[attr],
            )
            register_converters(getattr(mod, attr, []))
        except ImportError:
            continue


_load_optional_converters()
