#!/usr/bin/env Rscript

suppressPackageStartupMessages({
  library(cfb4th)
  library(dplyr)
  library(jsonlite)
  library(tibble)
})

quarter_clock_to_game_seconds <- function(period, time_secs_rem) {
  if (period < 1 || period > 4) stop("period must be between 1 and 4")
  ((4 - period) * 15 * 60) + time_secs_rem
}

format_clock <- function(seconds) {
  minutes <- floor(seconds / 60)
  remainder <- seconds %% 60
  sprintf("%02d:%02d", minutes, remainder)
}

recommendation_from_probs <- function(go_wp, punt_wp, fg_wp) {
  labels <- c("Go for It", "Punt", "Field Goal")
  values <- c(go_wp, punt_wp, fg_wp)
  labels[[which.max(values)]]
}

quarter_values <- c(2, 4)
time_seconds_values <- c(720, 480, 300, 180, 90, 45)
score_diff_values <- c(-14, -10, -7, -3, 0, 3, 7)
yards_to_goal_values <- seq(10, 90, by = 2)
distance_values <- c(1, 2, 3, 4, 5, 7, 10)

grid <- expand.grid(
  yards_to_goal = yards_to_goal_values,
  distance = distance_values,
  period = quarter_values,
  time_secs_rem = time_seconds_values,
  pos_score_diff_start = score_diff_values,
  stringsAsFactors = FALSE
) |>
  as_tibble() |>
  mutate(
    home = "Home",
    away = "Away",
    pos_team = "Offense",
    def_pos_team = "Defense",
    spread = -3,
    over_under = 52,
    half = if_else(period <= 2, 1, 2),
    TimeSecsRem = time_secs_rem,
    adj_TimeSecsRem = mapply(quarter_clock_to_game_seconds, period, time_secs_rem),
    down = 4,
    pos_team_receives_2H_kickoff = 1,
    pos_team_timeouts_rem_before = 3,
    def_pos_team_timeouts_rem_before = 3
  ) |>
  select(
    home, away, pos_team, def_pos_team,
    spread, over_under,
    half, period, TimeSecsRem, adj_TimeSecsRem,
    down, distance, yards_to_goal, pos_score_diff_start,
    pos_team_receives_2H_kickoff,
    pos_team_timeouts_rem_before,
    def_pos_team_timeouts_rem_before
  )

message("Generating cfb4th probabilities for ", nrow(grid), " scenarios...")
probs <- cfb4th::add_4th_probs(grid)

scenarios <- lapply(seq_len(nrow(probs)), function(i) {
  row <- probs[i, ]

  yard_line <- 100 - row$yards_to_goal[[1]]
  yards_to_go <- row$distance[[1]]
  quarter <- row$period[[1]]
  time_remaining <- format_clock(row$TimeSecsRem[[1]])
  score_differential <- row$pos_score_diff_start[[1]]

  go_wp <- row$go_wp[[1]]
  punt_wp <- row$punt_wp[[1]]
  fg_wp <- row$fg_wp[[1]]

  list(
    key = paste(yard_line, yards_to_go, quarter, time_remaining, score_differential, sep = "|"),
    input = list(
      yardLine = yard_line,
      yardsToGo = yards_to_go,
      quarter = quarter,
      timeRemaining = time_remaining,
      scoreDifferential = score_differential
    ),
    output = list(
      recommendation = recommendation_from_probs(go_wp, punt_wp, fg_wp),
      goWinProb = unname(go_wp),
      puntWinProb = unname(punt_wp),
      fgWinProb = unname(fg_wp),
      firstDownProb = unname(row$first_down_prob[[1]]),
      fgMakeProb = unname(row$fg_make_prob[[1]]),
      wpFail = unname(row$wp_fail[[1]]),
      wpSucceed = unname(row$wp_succeed[[1]]),
      missFgWp = unname(row$miss_fg_wp[[1]]),
      makeFgWp = unname(row$make_fg_wp[[1]]),
      goBoost = unname(row$go_boost[[1]])
    )
  )
})

surface <- list(
  notes = c(
    "Generated from the installed cfb4th R package via add_4th_probs().",
    "Phase 1 current-like simple-state surface with fixed defaults for spread, total, kickoff, and timeouts.",
    "Keys and input fields use the existing frontend yardLine/yardsToGo/quarter/timeRemaining/scoreDifferential convention."
  ),
  scenarioCount = length(scenarios),
  dimensions = list(
    yardLines = as.list(100 - yards_to_goal_values),
    yardsToGo = as.list(distance_values),
    quarters = as.list(quarter_values),
    timeRemaining = as.list(vapply(time_seconds_values, format_clock, character(1))),
    scoreDiffs = as.list(score_diff_values)
  ),
  defaults = list(
    spread = -3,
    overUnder = 52,
    receivesSecondHalfKickoff = 1,
    offenseTimeouts = 3,
    defenseTimeouts = 3
  ),
  scenarios = scenarios
)

output_path <- "/Users/mark/Documents/Projects/sportsecon/data/cfb4th-generated-surface-phase1.json"
write_json(surface, output_path, auto_unbox = TRUE, pretty = FALSE)
message("Wrote surface to ", output_path)
message("Scenario count: ", length(scenarios))
