/**
 * The approved open-licence policy for editorial images: the only licences an image may carry,
 * for the registry (src/data/images.ts) and for anything that references it (discovery records,
 * src/discovery/validate.ts). One definition, so they can't drift apart. Changing this list is a
 * policy decision, not a code change.
 */
export const PERMITTED_IMAGE_LICENSES = ['CC0', 'Public domain', 'CC BY 2.0', 'CC BY 3.0', 'CC BY 4.0', 'CC BY-SA 2.0', 'CC BY-SA 3.0', 'CC BY-SA 4.0'] as const;
export type ImageLicense = (typeof PERMITTED_IMAGE_LICENSES)[number];
export const isPermittedImageLicense = (v: unknown): v is ImageLicense => typeof v === 'string' && (PERMITTED_IMAGE_LICENSES as readonly string[]).includes(v);
