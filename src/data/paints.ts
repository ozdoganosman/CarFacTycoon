import { msg } from '../i18n';

// The paints of the period. Coach varnish in a few deep colours until the twenties; Duco lacquer
// (1924) dried in hours and brought lighter colours to every price; the fifties went pastel and two-tone.
// Names are marked with msg(): show them with t().

export interface PaintDef {
  id: string;
  name: string;
  /** The colour as drawn (the same in both themes: a car is the colour it was painted). */
  color: string;
  /** First year it is offered. */
  year: number;
}

export const PAINTS: PaintDef[] = [
  { id: 'black', name: msg('Siyah'), color: '#1f1e1c', year: 1900 },
  { id: 'maroon', name: msg('Bordo'), color: '#7a2a24', year: 1900 },
  { id: 'brewster', name: msg('Brewster yeşili'), color: '#2f4a33', year: 1900 },
  { id: 'navy', name: msg('Lacivert'), color: '#23344f', year: 1900 },
  { id: 'carmine', name: msg('Al'), color: '#a3302a', year: 1900 },
  { id: 'cream', name: msg('Krem'), color: '#e3d5b0', year: 1900 },
  { id: 'grey', name: msg('Güvercin grisi'), color: '#7d8186', year: 1924 },
  { id: 'tan', name: msg('Kum beji'), color: '#b49a6a', year: 1924 },
  { id: 'blue', name: msg('Mavi'), color: '#3b5f8f', year: 1924 },
  { id: 'yellow', name: msg('Hardal sarısı'), color: '#c99a2e', year: 1928 },
  { id: 'seafoam', name: msg('Deniz köpüğü'), color: '#8fc3b3', year: 1950 },
  { id: 'coral', name: msg('Mercan'), color: '#e07a62', year: 1952 },
  { id: 'turquoise', name: msg('Turkuaz'), color: '#3aa3a6', year: 1954 },
  { id: 'pink', name: msg('Pembe'), color: '#e3a0ad', year: 1955 },
];

/** A contrasting roof became the fashion of the fifties. */
export const TWO_TONE_YEAR = 1950;

export const paintDef = (id: string | undefined) => PAINTS.find((p) => p.id === id);

/** The paints a car can be ordered in, in a year. */
export const paintsIn = (year: number) => PAINTS.filter((p) => p.year <= year);
