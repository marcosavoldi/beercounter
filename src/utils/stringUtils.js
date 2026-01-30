export const formatName = (name) => {
  if (!name) return "";
  // Force lowercase first to handle ALL CAPS scenarios if desired, 
  // but user only asked to ensure initials are Caps. 
  // Let's just Upper the first letter of each word to be safe for mixed case.
  return name.split(' ')
    .filter(word => word.length > 0)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1)) // Keep rest as is to preserve McLovin etc, or .toLowerCase() if we want strict normalizing
    .join(' ');
};

export const getInitials = (name) => {
  if (!name) return "??";
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
};
