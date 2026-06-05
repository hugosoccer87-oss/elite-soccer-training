export type ApprovedReview = {
  id: string;
  parentName: string;
  playerName?: string;
  playerAgeGroup?: string;
  rating: number;
  review: string;
};

export const approvedReviews: ApprovedReview[] = [
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
