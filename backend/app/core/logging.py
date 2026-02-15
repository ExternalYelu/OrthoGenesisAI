from loguru import logger


def init_logging() -> None:
    logger.remove()
    logger.add(
        sink=lambda msg: print(msg, end=""),
        level="INFO",
        backtrace=True,
        diagnose=False,
    )
