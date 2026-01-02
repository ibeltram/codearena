'use client';

import { useState, useEffect } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AdminPartnerReward,
  CreatePartnerInput,
  UpdatePartnerInput,
  useCreatePartner,
  useUpdatePartner,
} from '@/hooks/use-admin-rewards';
import { RewardTier, RewardType, rewardTypeLabels } from '@/types/rewards';

interface PartnerFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  partner?: AdminPartnerReward | null;
}

const emptyTier: RewardTier = {
  slug: '',
  name: '',
  description: '',
  creditsRequired: 100,
  valueDescription: '',
};

export function PartnerFormDialog({
  open,
  onOpenChange,
  partner,
}: PartnerFormDialogProps) {
  const isEditing = !!partner;

  // Form state
  const [partnerSlug, setPartnerSlug] = useState('');
  const [name, setName] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [description, setDescription] = useState('');
  const [rewardType, setRewardType] = useState<RewardType>('saas_offset');
  const [tiers, setTiers] = useState<RewardTier[]>([{ ...emptyTier }]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Mutations
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const isLoading = createPartner.isPending || updatePartner.isPending;

  // Reset form when dialog opens/closes or partner changes
  useEffect(() => {
    if (open && partner) {
      setPartnerSlug(partner.partnerSlug);
      setName(partner.name);
      setLogoUrl(partner.logoUrl || '');
      setDescription(partner.description || '');
      setRewardType(partner.rewardType);
      setTiers(partner.tiers.length > 0 ? partner.tiers : [{ ...emptyTier }]);
    } else if (open) {
      // Reset to empty for new partner
      setPartnerSlug('');
      setName('');
      setLogoUrl('');
      setDescription('');
      setRewardType('saas_offset');
      setTiers([{ ...emptyTier }]);
    }
    setErrors({});
  }, [open, partner]);

  // Auto-generate slug from name
  const handleNameChange = (value: string) => {
    setName(value);
    if (!isEditing && !partnerSlug) {
      const slug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      setPartnerSlug(slug);
    }
  };

  // Tier management
  const addTier = () => {
    setTiers([...tiers, { ...emptyTier }]);
  };

  const removeTier = (index: number) => {
    if (tiers.length > 1) {
      setTiers(tiers.filter((_, i) => i !== index));
    }
  };

  const updateTier = (index: number, field: keyof RewardTier, value: string | number) => {
    const updated = [...tiers];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-generate tier slug from tier name
    if (field === 'name' && typeof value === 'string') {
      const tierSlug = value
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');
      if (!updated[index].slug || updated[index].slug === tiers[index].slug) {
        updated[index].slug = tierSlug;
      }
    }

    setTiers(updated);
  };

  // Validation
  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!partnerSlug.trim()) {
      newErrors.partnerSlug = 'Partner slug is required';
    } else if (!/^[a-z0-9-]+$/.test(partnerSlug)) {
      newErrors.partnerSlug = 'Slug must be lowercase alphanumeric with hyphens only';
    }

    if (!name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (logoUrl && !isValidUrl(logoUrl)) {
      newErrors.logoUrl = 'Must be a valid URL';
    }

    // Validate tiers
    tiers.forEach((tier, index) => {
      if (!tier.slug.trim()) {
        newErrors[`tier_${index}_slug`] = 'Tier slug is required';
      } else if (!/^[a-z0-9-]+$/.test(tier.slug)) {
        newErrors[`tier_${index}_slug`] = 'Slug must be lowercase alphanumeric with hyphens';
      }
      if (!tier.name.trim()) {
        newErrors[`tier_${index}_name`] = 'Tier name is required';
      }
      if (!tier.description.trim()) {
        newErrors[`tier_${index}_description`] = 'Description is required';
      }
      if (tier.creditsRequired <= 0) {
        newErrors[`tier_${index}_credits`] = 'Credits must be positive';
      }
      if (!tier.valueDescription.trim()) {
        newErrors[`tier_${index}_value`] = 'Value description is required';
      }
    });

    // Check for duplicate tier slugs
    const slugCounts = tiers.reduce((acc, tier) => {
      acc[tier.slug] = (acc[tier.slug] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    tiers.forEach((tier, index) => {
      if (slugCounts[tier.slug] > 1) {
        newErrors[`tier_${index}_slug`] = 'Duplicate tier slug';
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validate()) return;

    try {
      if (isEditing && partner) {
        const updateData: UpdatePartnerInput = {
          name,
          logoUrl: logoUrl || null,
          description: description || null,
          rewardType,
          tiers,
        };
        await updatePartner.mutateAsync({ id: partner.id, data: updateData });
      } else {
        const createData: CreatePartnerInput = {
          partnerSlug,
          name,
          logoUrl: logoUrl || undefined,
          description: description || undefined,
          rewardType,
          tiers,
        };
        await createPartner.mutateAsync(createData);
      }
      onOpenChange(false);
    } catch (error: any) {
      console.error('Failed to save partner:', error);
      if (error.message?.includes('already exists')) {
        setErrors({ partnerSlug: 'This slug is already taken' });
      }
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? 'Edit Partner' : 'Add New Partner'}
          </DialogTitle>
          <DialogDescription>
            {isEditing
              ? 'Update the partner details and reward tiers.'
              : 'Create a new reward partner with their available tiers.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-muted-foreground">Partner Information</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input
                  id="name"
                  value={name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Vercel"
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && (
                  <p className="text-xs text-destructive">{errors.name}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="partnerSlug">Slug *</Label>
                <Input
                  id="partnerSlug"
                  value={partnerSlug}
                  onChange={(e) => setPartnerSlug(e.target.value.toLowerCase())}
                  placeholder="e.g., vercel"
                  disabled={isEditing}
                  className={errors.partnerSlug ? 'border-destructive' : ''}
                />
                {errors.partnerSlug && (
                  <p className="text-xs text-destructive">{errors.partnerSlug}</p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="logoUrl">Logo URL</Label>
              <div className="flex gap-2">
                <Input
                  id="logoUrl"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                  placeholder="https://example.com/logo.png"
                  className={errors.logoUrl ? 'border-destructive' : ''}
                />
                {logoUrl && isValidUrl(logoUrl) && (
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded border bg-muted">
                    <img
                      src={logoUrl}
                      alt="Preview"
                      className="h-8 w-8 object-contain"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                  </div>
                )}
              </div>
              {errors.logoUrl && (
                <p className="text-xs text-destructive">{errors.logoUrl}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Brief description of the partner and their offerings..."
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label>Reward Type *</Label>
              <div className="flex gap-4">
                {(['saas_offset', 'compute_credit'] as RewardType[]).map((type) => (
                  <label
                    key={type}
                    className={`flex cursor-pointer items-center gap-2 rounded-lg border px-4 py-2 transition-colors ${
                      rewardType === type
                        ? 'border-primary bg-primary/10'
                        : 'border-muted hover:border-muted-foreground/50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="rewardType"
                      value={type}
                      checked={rewardType === type}
                      onChange={(e) => setRewardType(e.target.value as RewardType)}
                      className="sr-only"
                    />
                    <span>{rewardTypeLabels[type]}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {/* Tiers */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-muted-foreground">Reward Tiers</h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={addTier}
                disabled={tiers.length >= 10}
              >
                <Plus className="mr-1 h-4 w-4" />
                Add Tier
              </Button>
            </div>

            <div className="space-y-4">
              {tiers.map((tier, index) => (
                <div
                  key={index}
                  className="rounded-lg border bg-muted/30 p-4 space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Tier {index + 1}</span>
                    {tiers.length > 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => removeTier(index)}
                        className="h-8 w-8 text-destructive hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Name *</Label>
                      <Input
                        value={tier.name}
                        onChange={(e) => updateTier(index, 'name', e.target.value)}
                        placeholder="e.g., Starter"
                        className={errors[`tier_${index}_name`] ? 'border-destructive' : ''}
                      />
                      {errors[`tier_${index}_name`] && (
                        <p className="text-xs text-destructive">{errors[`tier_${index}_name`]}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Slug *</Label>
                      <Input
                        value={tier.slug}
                        onChange={(e) => updateTier(index, 'slug', e.target.value.toLowerCase())}
                        placeholder="e.g., starter"
                        className={errors[`tier_${index}_slug`] ? 'border-destructive' : ''}
                      />
                      {errors[`tier_${index}_slug`] && (
                        <p className="text-xs text-destructive">{errors[`tier_${index}_slug`]}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-1">
                    <Label className="text-xs">Description *</Label>
                    <Input
                      value={tier.description}
                      onChange={(e) => updateTier(index, 'description', e.target.value)}
                      placeholder="e.g., Perfect for side projects"
                      className={errors[`tier_${index}_description`] ? 'border-destructive' : ''}
                    />
                    {errors[`tier_${index}_description`] && (
                      <p className="text-xs text-destructive">{errors[`tier_${index}_description`]}</p>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label className="text-xs">Credits Required *</Label>
                      <Input
                        type="number"
                        min="1"
                        value={tier.creditsRequired}
                        onChange={(e) => updateTier(index, 'creditsRequired', parseInt(e.target.value) || 0)}
                        className={errors[`tier_${index}_credits`] ? 'border-destructive' : ''}
                      />
                      {errors[`tier_${index}_credits`] && (
                        <p className="text-xs text-destructive">{errors[`tier_${index}_credits`]}</p>
                      )}
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs">Value Description *</Label>
                      <Input
                        value={tier.valueDescription}
                        onChange={(e) => updateTier(index, 'valueDescription', e.target.value)}
                        placeholder="e.g., $10 credit"
                        className={errors[`tier_${index}_value`] ? 'border-destructive' : ''}
                      />
                      {errors[`tier_${index}_value`] && (
                        <p className="text-xs text-destructive">{errors[`tier_${index}_value`]}</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isLoading}>
              {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {isEditing ? 'Save Changes' : 'Create Partner'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function isValidUrl(string: string): boolean {
  try {
    new URL(string);
    return true;
  } catch {
    return false;
  }
}
