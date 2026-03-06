/**
 * @typedef {Object} DayInput
 * @property {string} date  - "YYYY-MM-DD"
 * @property {number} steps
 * @property {number} dist_km
 * @property {number} time_min
 * @property {number} RPE
 * @property {number} up_pct
 * @property {number} down_pct
 * @property {number} up_grade_pct
 * @property {number} down_grade_pct
 * @property {number} surface_paved_pct
 * @property {number} surface_trail_pct
 * @property {number} surface_treadmill_pct
 * @property {number} surface_track_pct
 */

/**
 * @typedef {Object} ModelConfig
 * @property {number} Vref
 * @property {number} kG_plus
 * @property {number} kG_minus
 * @property {number} ks
 * @property {number} rho
 * @property {number} Delta
 * @property {number} Na
 * @property {number} Nc
 * @property {number} B
 * @property {number} eps
 * @property {number} tol
 */

/**
 * @typedef {Object} PartState
 * @property {number} w
 * @property {number} L_ext
 * @property {number} L
 * @property {number|null} L_bar_lag
 * @property {number|null} L_tilde
 * @property {number|null} A
 * @property {number|null} C
 * @property {number|null} R
 * @property {number|null} S
 */

/**
 * @typedef {Object} DayResult
 * @property {string} date
 * @property {Object} meta
 * @property {DayInput} input
 * @property {Object} derived
 * @property {Object} total
 * @property {Object} weights
 * @property {Object<string, PartState>} parts
 * @property {Object} global
 * @property {Object} checks
 */
export {};