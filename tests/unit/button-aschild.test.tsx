import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Button, buttonVariants } from '@/components/ui/button';

/**
 * Regression tests for a production crash.
 *
 * `<Button asChild>` threw "React.Children.only expected to receive a single
 * React element child" and took down the whole umpiring page. Cause: Button
 * rendered the loading spinner as a SIBLING of `children`, so Radix `Slot`
 * received an array — and `[false, <a/>]` fails Children.only just as surely as
 * two elements do, meaning asChild was broken even with loading={false}.
 *
 * Neither `next build` nor the existing unit tests caught it, because nothing
 * rendered the component. These do.
 */
describe('Button asChild', () => {
  it('renders a single slotted child without throwing', () => {
    expect(() =>
      render(
        <Button asChild>
          <a href="https://example.com">Go</a>
        </Button>,
      ),
    ).not.toThrow();
  });

  it('renders as the child element, not a <button>', () => {
    render(
      <Button asChild variant="primary" brand="cricket">
        <a href="https://example.com">Go</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('https://example.com');
    expect(document.querySelector('button')).toBeNull();
  });

  it('passes the button styling onto the slotted child', () => {
    render(
      <Button asChild variant="primary" brand="cricket" className="flex-1">
        <a href="/x">Go</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.className).toContain('flex-1');
    expect(link.className.length).toBeGreaterThan('flex-1'.length);
  });

  it('survives a child containing an icon AND text', () => {
    // The real crash site: an anchor whose own children are multiple nodes.
    // That is fine for Slot — what matters is that BUTTON passes it one child.
    expect(() =>
      render(
        <Button asChild>
          <a href="/x">
            <svg data-testid="icon" /> Share on WhatsApp
          </a>
        </Button>,
      ),
    ).not.toThrow();
    expect(screen.getByTestId('icon')).toBeTruthy();
  });

  it('still renders a real <button> with a spinner when not slotted', () => {
    const { container } = render(<Button loading>Saving</Button>);
    const btn = screen.getByRole('button');
    expect(btn.tagName).toBe('BUTTON');
    expect(btn).toBeDisabled();
    // Spinner is a sibling span — legal here, since this path is not slotted.
    expect(container.querySelector('span.animate-spin')).not.toBeNull();
  });

  it('buttonVariants() gives the same styling without Slot at all', () => {
    // What ShareRow uses now: an anchor styled directly, so the page cannot be
    // brought down by Slot's single-child rule again.
    const cls = buttonVariants({ variant: 'primary', size: 'md', brand: 'cricket' });
    expect(typeof cls).toBe('string');
    expect(cls.length).toBeGreaterThan(0);
  });
});
