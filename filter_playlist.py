#!/usr/bin/env python3
"""
Filter M3U playlist to only include sports-related channels.
"""

import sys

def filter_playlist(input_file, output_file):
    """Filter playlist based on keywords."""
    keywords = ['sports', 'football', 'Arsenal', 'Peacock', 'EPL']
    
    # Read all lines
    with open(input_file, 'r', encoding='utf-8') as f:
        lines = f.readlines()
    
    filtered_lines = []
    i = 0
    
    # Process the file line by line
    while i < len(lines):
        line = lines[i]
        
        # Always include header lines
        if line.startswith('#EXTM3U') or line.startswith('#EXT-X-SESSION-DATA'):
            filtered_lines.append(line)
            i += 1
            continue
        
        # Check if this is an EXTINF line
        if line.startswith('#EXTINF'):
            # Check if any keyword appears in this line (case-insensitive)
            line_lower = line.lower()
            matches = any(keyword.lower() in line_lower for keyword in keywords)
            
            if matches:
                # Include the EXTINF line
                filtered_lines.append(line)
                i += 1
                # Include the URL line that follows (if it exists and doesn't start with #)
                if i < len(lines) and not lines[i].startswith('#'):
                    filtered_lines.append(lines[i])
                    i += 1
                else:
                    i += 1
            else:
                # Skip this EXTINF line and the URL line that follows
                i += 1
                if i < len(lines) and not lines[i].startswith('#'):
                    i += 1
        else:
            # Skip any other lines that aren't part of matched entries
            i += 1
    
    # Write filtered playlist
    with open(output_file, 'w', encoding='utf-8') as f:
        f.writelines(filtered_lines)
    
    print(f"Filtered playlist written to: {output_file}")
    print(f"Total lines in original: {len(lines)}")
    print(f"Total lines in filtered: {len(filtered_lines)}")
    print(f"Channels matched: {(len(filtered_lines) - 2) // 2}")  # Subtract header lines, divide by 2 (EXTINF + URL)

if __name__ == '__main__':
    input_file = 'playlist_BenjaminIrwin_plus.m3u'
    output_file = 'playlist_BenjaminIrwin_plus_filtered.m3u'
    
    filter_playlist(input_file, output_file)


