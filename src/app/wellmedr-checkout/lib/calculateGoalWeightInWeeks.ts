const calculateGoalWeightInWeeks = (
  weight: number,
  goalWeight: number
): number => {
  return Math.max(1, Math.round((weight - goalWeight) / 3.75));
};

export default calculateGoalWeightInWeeks;
