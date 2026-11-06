export function formatFeatureTitle(title: string): string {
  return title.toUpperCase();
}

export function truncateDescription(description: string, maxLength: number): string {
  if (description.length <= maxLength) return description;
  return description.slice(0, maxLength - 3) + '...';
}