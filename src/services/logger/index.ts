import winston from "winston"
import { LOG_LEVEL } from "../../config"

const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.json(),
  defaultMeta: {
    service: "read-more",
  },
  transports: [new winston.transports.Console({ format: winston.format.simple() })],
})

export default logger
