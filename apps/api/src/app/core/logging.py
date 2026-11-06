import sys

import structlog
from structlog.types import Processor


def add_log_level(logger, method_name, event_dict):
    event_dict["level"] = method_name.upper()
    return event_dict


def add_timestamp(logger, method_name, event_dict):
    from datetime import UTC, datetime
    event_dict["timestamp"] = datetime.now(UTC).isoformat()
    return event_dict


def drop_color_message_key(logger, method_name, event_dict):
    event_dict.pop("color_message", None)
    return event_dict


def setup_logging(log_level: str = "INFO"):
    shared_processors: list[Processor] = [
        structlog.contextvars.merge_contextvars,
        add_timestamp,
        add_log_level,
        structlog.processors.add_logger_name,
        structlog.processors.format_exc_info,
        drop_color_message_key,
    ]

    if sys.stderr.isatty():
        processors = shared_processors + [
            structlog.dev.ConsoleRenderer(colors=True),
        ]
    else:
        processors = shared_processors + [
            structlog.processors.dict_tracebacks,
            structlog.processors.JSONRenderer(),
        ]

    structlog.configure(
        processors=processors,
        wrapper_class=structlog.make_filtering_bound_logger(
            getattr(structlog, log_level.upper(), structlog.INFO)
        ),
        context_class=dict,
        logger_factory=structlog.PrintLoggerFactory(),
        cache_logger_on_first_use=True,
    )


def get_logger(name: str = None):
    return structlog.get_logger(name)
