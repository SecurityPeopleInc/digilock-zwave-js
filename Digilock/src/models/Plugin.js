/**
 * Base Plugin class for extending ZWaveController and ZWaveLock functionality
 */
export class Plugin {
  constructor(name, description) {
    this.name = name;
    this.description = description;
    this.commands = [];
  }

  /**
   * Apply this plugin to a target instance (ZWaveController or ZWaveLock)
   * @param {Object} target - The instance to apply the plugin to
   * @param {Object} options - Options for the plugin
   */
  apply(target, options = {}) {
    throw new Error(
      `Plugin ${this.name} must implement the apply() method`
    );
  }
}