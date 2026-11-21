// Single source of truth for the five ratings visible to the client.
export const FEEDBACK_CATEGORIES = [
  ["booking_experience", "Booking Experience"],
  ["staff_service", "Staff Service"],
  ["studio_experience", "Studio Experience"],
  ["cleanliness", "Studio Cleanliness"],
];
export const RATING_LABELS = ["", "Poor", "Fair", "Good", "Very Good", "Excellent"];
export const REQUIRED_FEEDBACK_RATINGS = ["rating", ...FEEDBACK_CATEGORIES.map(([key]) => key)];
export function missingFeedbackRatings(form) {
  return REQUIRED_FEEDBACK_RATINGS.filter((key) => !Number.isInteger(Number(form?.[key])) || Number(form[key]) < 1 || Number(form[key]) > 5);
}
