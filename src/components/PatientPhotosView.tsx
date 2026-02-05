"use client";

/**
 * Patient Photos View Component
 *
 * Allows providers to view patient photos with:
 * - Progress photos gallery
 * - ID verification workflow
 * - Medical images review
 * - Verification status management
 */

import { useState, useEffect, useCallback } from "react";
import {
  Camera,
  Shield,
  Stethoscope,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  TrendingDown,
  Layers,
  Loader2,
  ChevronRight,
  Eye,
  RefreshCw,
} from "lucide-react";
import { PhotoGallery, PhotoComparison } from "@/components/patient-portal/photos";
import { PatientPhotoType, PatientPhotoVerificationStatus } from "@prisma/client";
import { format, parseISO } from "date-fns";

// =============================================================================
// Types
// =============================================================================

interface Photo {
  id: number;
  createdAt: string;
  updatedAt: string;
  type: PatientPhotoType;
  category: string | null;
  s3Url: string | null;
  thumbnailUrl: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  title: string | null;
  notes: string | null;
  weight: number | null;
  takenAt: string;
  verificationStatus: PatientPhotoVerificationStatus;
  verifiedAt: string | null;
  verificationNotes: string | null;
  isPrivate: boolean;
  isDeleted: boolean;
}

interface PatientPhotosViewProps {
  patientId: number;
  patientName: string;
}

type TabType = "progress" | "verification" | "medical";

// =============================================================================
// Verification Status Config
// =============================================================================

const VERIFICATION_STATUS_CONFIG: Record<
  PatientPhotoVerificationStatus,
  { label: string; color: string; icon: React.ElementType }
> = {
  NOT_APPLICABLE: { label: "N/A", color: "text-gray-500", icon: CheckCircle },
  PENDING: { label: "Pending", color: "text-yellow-600", icon: Clock },
  IN_REVIEW: { label: "In Review", color: "text-blue-600", icon: Clock },
  VERIFIED: { label: "Verified", color: "text-green-600", icon: CheckCircle },
  REJECTED: { label: "Rejected", color: "text-red-600", icon: XCircle },
  EXPIRED: { label: "Expired", color: "text-orange-600", icon: AlertCircle },
};

// =============================================================================
// Component
// =============================================================================

export default function PatientPhotosView({
  patientId,
  patientName,
}: PatientPhotosViewProps) {
  const [activeTab, setActiveTab] = useState<TabType>("progress");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [showCompare, setShowCompare] = useState(false);
  const [comparePhotos, setComparePhotos] = useState<{
    before: Photo | null;
    after: Photo | null;
  }>({ before: null, after: null });

  // Fetch photos
  const fetchPhotos = useCallback(async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem("auth-token") || "";

      const response = await fetch(
        `/api/patient-portal/photos?patientId=${patientId}&limit=100`,
        {
          credentials: "include",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.ok) {
        const data = await response.json();
        setPhotos(data.photos || []);
      } else {
        throw new Error("Failed to load photos");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load photos");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Filter photos by type
  const progressPhotos = photos.filter((p) =>
    ["PROGRESS_FRONT", "PROGRESS_SIDE", "PROGRESS_BACK"].includes(p.type)
  );

  const verificationPhotos = photos.filter((p) =>
    ["ID_FRONT", "ID_BACK", "SELFIE"].includes(p.type)
  );

  const medicalPhotos = photos.filter((p) => p.type.startsWith("MEDICAL_"));

  // Get pending verification count
  const pendingVerificationCount = verificationPhotos.filter(
    (p) => p.verificationStatus === "PENDING" || p.verificationStatus === "IN_REVIEW"
  ).length;

  // Handle verification action
  const handleVerify = async (photoId: number, status: "VERIFIED" | "REJECTED") => {
    setVerifyingId(photoId);
    try {
      const token = localStorage.getItem("auth-token") || "";

      const response = await fetch(`/api/admin/patient-photos/${photoId}/verify`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          status,
          notes: status === "REJECTED" ? rejectionReason : undefined,
        }),
      });

      if (response.ok) {
        // Update local state
        setPhotos((prev) =>
          prev.map((p) =>
            p.id === photoId
              ? {
                  ...p,
                  verificationStatus: status,
                  verifiedAt: new Date().toISOString(),
                  verificationNotes: status === "REJECTED" ? rejectionReason : null,
                }
              : p
          )
        );
        setRejectionReason("");
      } else {
        const data = await response.json();
        alert(data.error || "Failed to update verification status");
      }
    } catch (err) {
      console.error("Verification error:", err);
    } finally {
      setVerifyingId(null);
    }
  };

  // Setup comparison
  const setupComparison = () => {
    const sorted = [...progressPhotos].sort(
      (a, b) => new Date(a.takenAt).getTime() - new Date(b.takenAt).getTime()
    );
    if (sorted.length >= 2) {
      setComparePhotos({
        before: sorted[0],
        after: sorted[sorted.length - 1],
      });
      setShowCompare(true);
    }
  };

  const tabs = [
    {
      id: "progress" as TabType,
      label: "Progress",
      icon: TrendingDown,
      count: progressPhotos.length,
    },
    {
      id: "verification" as TabType,
      label: "Verification",
      icon: Shield,
      count: verificationPhotos.length,
      badge: pendingVerificationCount > 0 ? pendingVerificationCount : undefined,
    },
    {
      id: "medical" as TabType,
      label: "Medical",
      icon: Stethoscope,
      count: medicalPhotos.length,
    },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-red-400 mx-auto mb-4" />
        <p className="text-red-600 font-medium">{error}</p>
        <button
          onClick={fetchPhotos}
          className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Camera className="h-6 w-6 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Patient Photos</h2>
        </div>
        <button
          onClick={fetchPhotos}
          className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="h-5 w-5" />
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b border-gray-200 -mb-px">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                isActive
                  ? "border-blue-500 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              <span className="text-xs text-gray-400">({tab.count})</span>
              {tab.badge && (
                <span className="ml-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded-full">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Progress Photos Tab */}
      {activeTab === "progress" && (
        <div className="space-y-4">
          {progressPhotos.length > 1 && (
            <button
              onClick={setupComparison}
              className="w-full rounded-lg bg-gradient-to-r from-purple-500 to-blue-500 p-4 text-white flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <Layers className="h-6 w-6" />
                <div className="text-left">
                  <p className="font-medium">Compare Progress</p>
                  <p className="text-sm text-white/80">
                    View first vs latest photos
                  </p>
                </div>
              </div>
              <ChevronRight className="h-5 w-5" />
            </button>
          )}

          {progressPhotos.length > 0 ? (
            <PhotoGallery
              photos={progressPhotos}
              showFilters
              showDateGroups
              showWeight
              emptyMessage="No progress photos"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Camera className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No progress photos uploaded</p>
            </div>
          )}
        </div>
      )}

      {/* Verification Tab */}
      {activeTab === "verification" && (
        <div className="space-y-4">
          {verificationPhotos.length > 0 ? (
            <div className="grid gap-4">
              {verificationPhotos.map((photo) => {
                const statusConfig =
                  VERIFICATION_STATUS_CONFIG[photo.verificationStatus];
                const StatusIcon = statusConfig.icon;
                const needsVerification =
                  photo.verificationStatus === "PENDING" ||
                  photo.verificationStatus === "IN_REVIEW";

                return (
                  <div
                    key={photo.id}
                    className="bg-white rounded-xl border border-gray-200 p-4"
                  >
                    <div className="flex gap-4">
                      {/* Thumbnail */}
                      <div className="flex-shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-gray-100">
                        {photo.s3Url || photo.thumbnailUrl ? (
                          <img
                            src={photo.thumbnailUrl || photo.s3Url!}
                            alt={photo.type}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Shield className="h-8 w-8 text-gray-300" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-medium text-gray-900">
                            {photo.type.replace(/_/g, " ")}
                          </h4>
                          <span
                            className={`flex items-center gap-1 text-sm ${statusConfig.color}`}
                          >
                            <StatusIcon className="h-4 w-4" />
                            {statusConfig.label}
                          </span>
                        </div>

                        <p className="text-sm text-gray-500 mb-2">
                          Uploaded {format(parseISO(photo.createdAt), "MMM d, yyyy h:mm a")}
                        </p>

                        {photo.verifiedAt && (
                          <p className="text-xs text-gray-400">
                            {photo.verificationStatus === "VERIFIED"
                              ? "Verified"
                              : "Reviewed"}{" "}
                            {format(parseISO(photo.verifiedAt), "MMM d, yyyy")}
                          </p>
                        )}

                        {photo.verificationNotes && (
                          <p className="text-sm text-red-600 mt-1">
                            Reason: {photo.verificationNotes}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Verification Actions */}
                    {needsVerification && (
                      <div className="mt-4 pt-4 border-t border-gray-100">
                        {verifyingId === photo.id ? (
                          <div className="flex justify-center py-2">
                            <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                          </div>
                        ) : (
                          <div className="flex gap-3">
                            <button
                              onClick={() => handleVerify(photo.id, "VERIFIED")}
                              className="flex-1 flex items-center justify-center gap-2 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                            >
                              <CheckCircle className="h-4 w-4" />
                              Verify
                            </button>
                            <div className="flex-1 flex gap-2">
                              <input
                                type="text"
                                value={rejectionReason}
                                onChange={(e) => setRejectionReason(e.target.value)}
                                placeholder="Reason (optional)"
                                className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm"
                              />
                              <button
                                onClick={() => handleVerify(photo.id, "REJECTED")}
                                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                              >
                                <XCircle className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* View Full Size */}
                    {photo.s3Url && (
                      <a
                        href={photo.s3Url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 flex items-center justify-center gap-2 text-sm text-blue-600 hover:text-blue-700"
                      >
                        <Eye className="h-4 w-4" />
                        View Full Size
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Shield className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No verification photos uploaded</p>
            </div>
          )}
        </div>
      )}

      {/* Medical Photos Tab */}
      {activeTab === "medical" && (
        <div>
          {medicalPhotos.length > 0 ? (
            <PhotoGallery
              photos={medicalPhotos}
              showFilters
              showDateGroups
              emptyMessage="No medical images"
            />
          ) : (
            <div className="text-center py-12 text-gray-500">
              <Stethoscope className="h-12 w-12 mx-auto mb-4 text-gray-300" />
              <p>No medical images uploaded</p>
            </div>
          )}
        </div>
      )}

      {/* Photo Comparison Modal */}
      {showCompare && comparePhotos.before && comparePhotos.after && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <PhotoComparison
              beforePhoto={comparePhotos.before}
              afterPhoto={comparePhotos.after}
              onClose={() => setShowCompare(false)}
              showFullscreen
            />
          </div>
        </div>
      )}
    </div>
  );
}
