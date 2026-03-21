/// Cricket-themed welcome messages for new team members
/// Usage: getWelcomeMessage(playerName) → random welcome string

const WELCOME_TEMPLATES = [
  (name: string) => `Welcome to the squad, ${name}! Let's make this season one for the books`,
  (name: string) => `${name} has joined the team! Another warrior in the dugout`,
  (name: string) => `Big welcome to ${name}! The team just got stronger`,
  (name: string) => `${name} is officially a Sunriser! Time to hit the ground running`,
  (name: string) => `Welcome aboard, ${name}! Can't wait to see you on the field`,
  (name: string) => `The squad grows! ${name} joins the Sunrisers family`,
  (name: string) => `${name} has entered the arena! Welcome to Sunrisers Manteca`,
  (name: string) => `New player alert! Welcome ${name} to the team`,
  (name: string) => `${name} just leveled up our roster! Welcome to the squad`,
  (name: string) => `Say hello to our newest Sunriser — ${name}! Let's go`,
];

export function getWelcomeMessage(playerName: string): string {
  const index = Math.floor(Math.random() * WELCOME_TEMPLATES.length);
  return WELCOME_TEMPLATES[index](playerName);
}

export function getWelcomeCaption(playerName: string): string {
  return `${getWelcomeMessage(playerName)} @${playerName} @Everyone`;
}
