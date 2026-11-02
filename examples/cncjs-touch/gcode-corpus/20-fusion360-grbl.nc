%
(1001)
(Machine)
(  vendor: Autodesk)
(  description: Generic Grbl)
(T1  D=3.175 CR=0. - ZMIN=-1.5 - flat end mill)
G90 G94
G17
G21

(2D Contour1)
T1
S12000 M3
G54
G0 X12.5 Y-2.
Z15.
Z5.
G1 Z-1.5 F333.3
G1 Y30. F1000.
X42.5
G3 X47.5 Y35. I0. J5.
G1 Y40.
G0 Z15.
G28 G91 Z0.
G90

M5
G28 G91 X0. Y0.
G90
M30
%
