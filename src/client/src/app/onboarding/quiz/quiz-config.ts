export type QuizStepId =
  | 'highest_level_played'
  | 'strongest_opponents'
  | 'competitive_history'
  | 'play_frequency';

export type QuizStep = {
  id: QuizStepId;
  prompt: string;
  type: 'single_choice';
  options: { id: string; label: string }[];
};

// Option ids here must match the server's scoring maps in
// rating.algorithm.ts (ONBOARDING_OPTION_SCORES) — copy can change freely,
// ids can't without updating both sides.
export const quizSteps: QuizStep[] = [
  {
    id: 'highest_level_played',
    prompt: 'What’s the highest level you’ve played at?',
    type: 'single_choice',
    options: [
      { id: 'never_played', label: 'Never really played, or just starting out' },
      { id: 'casual_pickup', label: 'Casual pickup or recreational games' },
      { id: 'club_league', label: 'Regular club or league play' },
      { id: 'regional_tournament', label: 'Regional or sanctioned tournaments' },
      { id: 'national_or_above', label: 'National-level competition or higher' },
    ],
  },
  {
    id: 'strongest_opponents',
    prompt: 'Who are the strongest opponents you’ve regularly played against?',
    type: 'single_choice',
    options: [
      { id: 'beginners', label: 'Mostly beginners' },
      { id: 'recreational_players', label: 'Recreational club players' },
      { id: 'competitive_club', label: 'Competitive club players' },
      { id: 'regional_tournament_players', label: 'Regional or tournament-level players' },
      { id: 'national_or_pro', label: 'National-ranked or pro players' },
    ],
  },
  {
    id: 'competitive_history',
    prompt: 'What’s your competitive tournament history?',
    type: 'single_choice',
    options: [
      { id: 'none', label: 'Never entered a tournament' },
      { id: 'local_casual', label: 'Local or casual tournaments' },
      { id: 'regional_sanctioned', label: 'Regional sanctioned tournaments' },
      { id: 'national', label: 'National-level tournaments' },
    ],
  },
  {
    id: 'play_frequency',
    prompt: 'How often do you play?',
    type: 'single_choice',
    options: [
      { id: 'rarely', label: 'A few times a year' },
      { id: 'monthly', label: 'About once a month' },
      { id: 'weekly', label: 'About once a week' },
      { id: 'multiple_weekly', label: 'Multiple times a week' },
    ],
  },
];
