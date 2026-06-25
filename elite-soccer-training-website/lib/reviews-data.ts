export type ApprovedReview = {
  id: string;
  parentName: string;
  subtitle?: string;
  playerName?: string;
  playerAgeGroup?: string;
  rating: number;
  review: string;
  fullReview?: string;
};

export const approvedReviews: ApprovedReview[] = [
  {
    id: "jennifer-stroud-2010-player",
    parentName: "Jennifer Stroud",
    subtitle: "Parent of 2010 player",
    playerName: "Madison Stroud",
    playerAgeGroup: "2010 player",
    rating: 5,
    review:
      "Coach Hugo has been an incredible influence on my daughter and so many other players. He balances high expectations and competitive training with positivity, professionalism, and a genuine love for the game.",
    fullReview:
      "Coach Hugo has been an incredible influence on my daughter and so many other players over the past seven years. What sets him apart is his ability to balance high expectations and serious, competitive training with a positive attitude and genuine love for the game. He creates an environment where players work hard while still enjoying every moment.\n\nHis knowledge of soccer is exceptional. He understands the game, the rules, and the strategies at a deep level and communicates them in a way that players can understand and apply on the field. He teaches not only the technical and tactical aspects of soccer, but also the importance of decision-making, teamwork, and accountability.\n\nOne of the qualities I respect most is his ability to handle difficult situations with confidence and professionalism. Whether interacting with referees, opposing coaches, or parents, he is never intimidated, yet he is always willing to listen, communicate, and have respectful conversations.\n\nMost importantly, he teaches lessons that go far beyond soccer. He emphasizes respect for teammates, opponents, officials, the game itself, and oneself. The character, discipline, and sportsmanship he instills in his players will benefit them long after their playing days are over.\n\nIf you're looking for a coach who develops skilled athletes while also helping young players become confident, respectful, and hardworking individuals, I cannot recommend him highly enough."
  },
  {
    id: "parent-2012-player",
    parentName: "Parent of 2012 Player",
    playerAgeGroup: "2012 player",
    rating: 5,
    review:
      "The sessions are organized, intense, and focused. My son has already improved his confidence and speed of play."
  },
  {
    id: "parent-2014-player",
    parentName: "Parent of 2014 Player",
    playerAgeGroup: "2014 player",
    rating: 5,
    review:
      "Great small group environment. The training is detailed, competitive, and keeps players engaged."
  },
  {
    id: "parent-high-school-player",
    parentName: "Parent of High School Player",
    playerAgeGroup: "High school player",
    rating: 5,
    review:
      "Coach Hugo creates a professional training environment that pushes players while building confidence."
  }
];
