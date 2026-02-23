/**
 * Root page — redirects to /maps
 */

import { redirect } from 'next/navigation';

export default function Home() {
  redirect('/maps');
}
