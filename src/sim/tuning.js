// Single source of truth for gameplay numbers.
// game.contract.json "tuning" MUST match these values (checked by tests/contract.test.js).
export const TUNING = Object.freeze({
  player_speed: 6, // m/s
  carry_capacity: 5, // motes carried at once
  lantern_cost: 5, // motes needed to light one lantern
  lantern_count_night1: 5,
  pickup_radius: 1.5, // m
  interact_radius: 3, // m (player feet -> lantern base)
  pulse_cost: 1, // carried motes consumed per pulse
  pulse_radius: 6, // m
  night1_duration_s: 300,
  flames: 3, // health
  invuln_s: 1.5,
  hit_drop_ratio: 0.5, // floor(carried * ratio) motes are lost on hit
  pulse_stun_s: 2,
  pulse_push_m: 4,
  pulse_cooldown_s: 1,
  safe_radius: 6, // shades can never be within this distance of ANY lantern
  shade_speed: 3.5,
  shade_hit_radius: 1,
  fall_enabled: false, // island edge is a wall, no falling
  score: Object.freeze({
    per_mote: 10,
    per_lantern: 100,
    per_stun: 20,
    per_second_left: 1, // only on win, floor(time_left_s)
    per_flame_left: 50, // only on win
  }),
});

// Internal constants (not part of the contract).
export const WORLD = Object.freeze({
  tick_rate: 60,
  island_radius: 40, // player & shades are clamped inside
  lantern_ring_radius: 25,
  shade_height: 1, // shade.pos.y (center of body)
  jump_speed: 7, // m/s
  gravity: 20, // m/s^2
  mote_target: 25, // random motes kept active up to this number
  mote_respawn_s: 3,
  mote_min_r: 3,
  mote_max_r: 38,
  shade_initial: 2, // spawned during setup (no events)
  shade_max: 5,
  shade_spawn_every_s: 30,
  shade_spawn_r: 36,
  shade_spawn_min_player_dist: 15,
});
