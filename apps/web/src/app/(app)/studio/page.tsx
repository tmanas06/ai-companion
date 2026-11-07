import { redirect } from 'next/navigation';

export default function StudioPage() {
  // Legacy route — the 3D Avatar Studio has been removed. Any bookmarks or
  // in-app links still pointing here land on the 2D Companion page.
  redirect('/companion');
}
