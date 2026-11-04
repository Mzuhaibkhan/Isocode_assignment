import { BASE_MOISTURE_X10, moisturePermille } from "./money.js";

export { BASE_MOISTURE_X10, moisturePermille };

export interface MoistureRule {
  crop: string;
  baseMoistureX10: number;
  deductionPermillePerPoint: number;
}

