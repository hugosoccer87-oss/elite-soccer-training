export type ApprovedReview = {
  parentName: string;
  playerLabel?: string;
  rating: number;
  review: string;
};

export const approvedReviews: ApprovedReview[] = [
  {
    parentName: "Parent of 2012 Player",
    playerLabel: "2012 player",
    rating: 5,
    review:
      "The sessions are organized, intense, and focused. My son has already improved his confidence and speed of play."
  },
  {
    parentName: "Parent of 2014 Player",
    playerLabel: "2014 player",
    rating: 5,
    review:
      "Great small group environment. The training is detailed, competitive, and keeps players engaged."
  },
  {
    parentName: "Parent of High School Player",
    playerLabel: "High school player",
    rating: 5,
    review:
      "Coach Hugo creates a professional training environment that pushes players while building confidence."
  }
];
