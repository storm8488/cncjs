%
(Header: program with comments)
G21 G90 ; metric, absolute
G0 Z5 (clear)
(G0 X999 Y999 commented out)
; G1 X-999
G0 X10 Y10 ; go (to start)
G1 Z-1 F100 (plunge ; slowly)
G1 X20 (first) Y20 (second)
G0 Z5
M30
%
