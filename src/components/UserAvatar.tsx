'use client';

/**
 * UserAvatar Component
 *
 * A reusable avatar component for displaying user profile pictures
 * throughout the platform. Shows initials as fallback when no image is available.
 *
 * Used in: Chat, Settings, Navigation, User lists, Provider cards, etc.
 */

import React, { useState } from 'react';

export interface UserAvatarProps {
  /** URL of the profile picture */
  avatarUrl?: string | null;
  /** First name for generating initials */
  firstName?: string;
  /** Last name for generating initials */
  lastName?: string;
  /** Full name (alternative to firstName/lastName) */
  name?: string;
  /** Email (used for initials if name not provided) */
  email?: string;
  /** Size of the avatar */
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl';
  /** Whether to show online indicator */
  showOnlineIndicator?: boolean;
  /** Whether the user is online */
  isOnline?: boolean;
  /** Custom className for additional styling */
  className?: string;
  /** Alt text for the image */
  alt?: string;
  /** Click handler */
  onClick?: () => void;
}

const SIZE_CLASSES = {
  xs: 'w-6 h-6 text-xs',
  sm: 'w-8 h-8 text-xs',
  md: 'w-10 h-10 text-sm',
  lg: 'w-12 h-12 text-base',
  xl: 'w-16 h-16 text-lg',
  '2xl': 'w-20 h-20 text-xl',
};

const ONLINE_INDICATOR_CLASSES = {
  xs: 'w-1.5 h-1.5 border',
  sm: 'w-2 h-2 border',
  md: 'w-2.5 h-2.5 border-2',
  lg: 'w-3 h-3 border-2',
  xl: 'w-3.5 h-3.5 border-2',
  '2xl': 'w-4 h-4 border-2',
};

// Color palette for initials backgrounds based on name hash
const COLORS = [
  'bg-blue-500',
  'bg-green-500',
  'bg-yellow-500',
  'bg-purple-500',
  'bg-pink-500',
  'bg-indigo-500',
  'bg-red-500',
  'bg-orange-500',
  'bg-teal-500',
  'bg-cyan-500',
];

/**
 * Generate consistent color based on name
 */
function getColorFromName(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return COLORS[Math.abs(hash) % COLORS.length];
}

/**
 * Get initials from name
 */
function getInitials(firstName?: string, lastName?: string, name?: string, email?: string): string {
  // If firstName and lastName provided
  if (firstName && lastName) {
    return `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase();
  }

  // If only firstName provided
  if (firstName) {
    return firstName.charAt(0).toUpperCase();
  }

  // If full name provided
  if (name) {
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
    }
    return name.charAt(0).toUpperCase();
  }

  // If email provided, use first character
  if (email) {
    return email.charAt(0).toUpperCase();
  }

  // Default fallback
  return '?';
}

export function UserAvatar({
  avatarUrl,
  firstName,
  lastName,
  name,
  email,
  size = 'md',
  showOnlineIndicator = false,
  isOnline = false,
  className = '',
  alt,
  onClick,
}: UserAvatarProps) {
  const [imageError, setImageError] = useState(false);

  const initials = getInitials(firstName, lastName, name, email);
  const displayName = name || `${firstName || ''} ${lastName || ''}`.trim() || email || 'User';
  const bgColor = getColorFromName(displayName);

  const sizeClass = SIZE_CLASSES[size];
  const onlineIndicatorClass = ONLINE_INDICATOR_CLASSES[size];

  const shouldShowImage = avatarUrl && !imageError;

  const handleImageError = () => {
    setImageError(true);
  };

  const baseClasses = `
    relative inline-flex items-center justify-center rounded-full
    font-medium text-white overflow-hidden flex-shrink-0
    ${onClick ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''}
    ${className}
  `;

  return (
    <div
      className={`${baseClasses} ${sizeClass}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => e.key === 'Enter' && onClick() : undefined}
    >
      {shouldShowImage ? (
        <img
          src={avatarUrl}
          alt={alt || displayName}
          className="h-full w-full object-cover"
          onError={handleImageError}
        />
      ) : (
        <div className={`flex h-full w-full items-center justify-center ${bgColor}`}>
          {initials}
        </div>
      )}

      {/* Online indicator */}
      {showOnlineIndicator && (
        <span
          className={`absolute bottom-0 right-0 rounded-full border-white ${onlineIndicatorClass} ${isOnline ? 'bg-green-500' : 'bg-gray-400'} `}
        />
      )}
    </div>
  );
}

/**
 * Avatar with edit button overlay
 * Used in profile settings for changing avatar
 */
export interface EditableAvatarProps extends UserAvatarProps {
  onEdit?: () => void;
  isLoading?: boolean;
}

export function EditableAvatar({ onEdit, isLoading = false, ...avatarProps }: EditableAvatarProps) {
  return (
    <div className="group relative inline-block">
      <UserAvatar {...avatarProps} />

      {/* Edit overlay */}
      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          disabled={isLoading}
          className={`absolute inset-0 flex items-center justify-center rounded-full bg-black/50 opacity-0 transition-opacity duration-200 group-hover:opacity-100 ${isLoading ? 'cursor-wait' : 'cursor-pointer'} `}
          aria-label="Change profile picture"
        >
          {isLoading ? (
            <svg className="h-6 w-6 animate-spin text-white" fill="none" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              className="h-6 w-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 13a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}

export default UserAvatar;
