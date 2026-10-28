// CV list. Only the empty state exists so far; the list and editor are filled by their tasks.
export default function CvRoute() {
  return (
    <section className="screen-message">
      <h1>Your CVs</h1>
      <p>You have no CVs yet.</p>
      <a href="/cvs/new">Create your first CV</a>
    </section>
  );
}
