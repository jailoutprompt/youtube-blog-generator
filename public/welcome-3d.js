// 3D 오브젝트 드로잉 함수들 — 30개
// 사용법: draw3dObject(ctx, type, width, height, time)

var _3dTypes = [
  'coin','rocket','diamond','cube','ring','star','crown',
  'lightning','trophy','chart-up','safe','key','magnet',
  'target','hourglass','flame','shield','arrow-up','atom',
  'infinity','dollar','eye','lock-open','mountain','sun',
  'gear','bulb','graph','wave','hexagon'
];

function draw3dObject(g, type, W, H, t) {
  var mx=W/2, my=H/2;
  g.clearRect(0,0,W,H);

  switch(type) {
    case 'coin':
      var sx=Math.cos(t*1.5);
      var gr=g.createLinearGradient(mx-30*Math.abs(sx),my-30,mx+30*Math.abs(sx),my+30);
      gr.addColorStop(0,'#ffd700');gr.addColorStop(0.5,'#ffec80');gr.addColorStop(1,'#daa520');
      g.save();g.translate(mx,my);g.scale(Math.abs(sx)*0.9+0.1,1);
      g.beginPath();g.arc(0,0,42,0,Math.PI*2);g.fillStyle=gr;g.fill();
      g.strokeStyle='#b8860b';g.lineWidth=2.5;g.stroke();
      if(Math.abs(sx)>0.3){g.fillStyle='rgba(184,134,11,0.5)';g.font='bold 26px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('W',0,2);}
      g.restore();
      _glow(g,mx,my,'rgba(255,215,0,0.12)');
      break;

    case 'rocket':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t)*0.08);
      var by=Math.sin(t*2)*4;
      for(var i=0;i<6;i++){g.beginPath();g.arc((Math.random()-0.5)*10,28+Math.random()*18+by,2+Math.random()*3,0,Math.PI*2);g.fillStyle=['rgba(255,100,0,0.5)','rgba(255,200,0,0.4)','rgba(255,50,0,0.3)'][i%3];g.fill();}
      g.beginPath();g.moveTo(0,-38+by);g.bezierCurveTo(-14,-18+by,-14,22+by,0,32+by);g.bezierCurveTo(14,22+by,14,-18+by,0,-38+by);
      var rg=g.createLinearGradient(-14,0,14,0);rg.addColorStop(0,'#8b5cf6');rg.addColorStop(1,'#06b6d4');g.fillStyle=rg;g.fill();
      g.beginPath();g.arc(0,-8+by,6,0,Math.PI*2);g.fillStyle='rgba(255,255,255,0.8)';g.fill();
      g.beginPath();g.arc(0,-8+by,4,0,Math.PI*2);g.fillStyle='#22d3ee';g.fill();
      g.restore();
      break;

    case 'diamond':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t*0.8)*0.12);
      var ds=1+Math.sin(t*1.5)*0.04;g.scale(ds,ds);
      g.beginPath();g.moveTo(0,-42);g.lineTo(-28,-8);g.lineTo(0,42);g.lineTo(28,-8);g.closePath();
      var dg=g.createLinearGradient(-28,-42,28,42);dg.addColorStop(0,'#06b6d4');dg.addColorStop(0.4,'#a78bfa');dg.addColorStop(0.7,'#22d3ee');dg.addColorStop(1,'#8b5cf6');g.fillStyle=dg;g.fill();
      g.beginPath();g.moveTo(-28,-8);g.lineTo(28,-8);g.strokeStyle='rgba(255,255,255,0.25)';g.lineWidth=1;g.stroke();
      g.beginPath();g.arc(-6,-22,2.5,0,Math.PI*2);g.fillStyle='rgba(255,255,255,'+(0.4+Math.sin(t*4)*0.4)+')';g.fill();
      g.restore();
      break;

    case 'cube':
      g.save();g.translate(mx,my);
      var fs=[{z:Math.cos(t),c:'#8b5cf6'},{z:Math.cos(t+Math.PI/2),c:'#06b6d4'}];
      fs.sort(function(a,b){return a.z-b.z;});
      fs.forEach(function(f){g.save();g.rotate(t*0.5);var s=28+f.z*10;g.scale(s,s);g.beginPath();g.rect(-1,-1,2,2);g.fillStyle=f.c;g.globalAlpha=0.35+f.z*0.3;g.fill();g.strokeStyle='rgba(255,255,255,0.2)';g.lineWidth=0.04;g.stroke();g.restore();});
      g.restore();
      break;

    case 'ring':
      g.save();g.translate(mx,my);g.rotate(t*0.3);
      g.beginPath();g.arc(0,0,35,0,Math.PI*2);g.strokeStyle='#f59e0b';g.lineWidth=8;g.stroke();
      g.beginPath();g.arc(0,0,35,0,Math.PI*2);g.strokeStyle='rgba(245,158,11,0.3)';g.lineWidth=12;g.stroke();
      // 빛나는 점
      g.beginPath();g.arc(35*Math.cos(t*2),35*Math.sin(t*2),4,0,Math.PI*2);g.fillStyle='#ffd700';g.fill();
      g.restore();
      _glow(g,mx,my,'rgba(245,158,11,0.1)');
      break;

    case 'star':
      g.save();g.translate(mx,my);g.rotate(t*0.2);
      var sc=1+Math.sin(t*2)*0.08;g.scale(sc,sc);
      _drawStar(g,0,0,5,35,18);
      var sg=g.createLinearGradient(-35,-35,35,35);sg.addColorStop(0,'#f59e0b');sg.addColorStop(1,'#fbbf24');g.fillStyle=sg;g.fill();
      g.restore();
      _glow(g,mx,my,'rgba(245,158,11,0.1)');
      break;

    case 'crown':
      g.save();g.translate(mx,my);
      var cb=Math.sin(t*1.5)*3;
      g.beginPath();g.moveTo(-30,15+cb);g.lineTo(-30,-10+cb);g.lineTo(-15,-25+cb);g.lineTo(0,-5+cb);g.lineTo(15,-25+cb);g.lineTo(30,-10+cb);g.lineTo(30,15+cb);g.closePath();
      var cg=g.createLinearGradient(-30,-25,30,15);cg.addColorStop(0,'#ffd700');cg.addColorStop(1,'#daa520');g.fillStyle=cg;g.fill();
      g.strokeStyle='#b8860b';g.lineWidth=2;g.stroke();
      // 보석
      [[-15,-25],[0,-5],[15,-25]].forEach(function(p){g.beginPath();g.arc(p[0],p[1]+cb,4,0,Math.PI*2);g.fillStyle='#ef4444';g.fill();});
      g.restore();
      _glow(g,mx,my,'rgba(255,215,0,0.1)');
      break;

    case 'lightning':
      g.save();g.translate(mx,my);
      var ls=1+Math.sin(t*3)*0.05;g.scale(ls,ls);
      g.beginPath();g.moveTo(5,-45);g.lineTo(-15,-5);g.lineTo(5,-5);g.lineTo(-5,45);g.lineTo(20,5);g.lineTo(0,5);g.closePath();
      g.fillStyle='#fbbf24';g.fill();
      g.globalAlpha=0.3+Math.sin(t*5)*0.2;
      g.fillStyle='#fff';g.fill();
      g.globalAlpha=1;
      g.restore();
      _glow(g,mx,my,'rgba(251,191,36,0.15)');
      break;

    case 'trophy':
      g.save();g.translate(mx,my);
      var tb=Math.sin(t*1.2)*2;
      // 컵
      g.beginPath();g.moveTo(-20,-25+tb);g.bezierCurveTo(-25,-25+tb,-25,10+tb,-8,15+tb);g.lineTo(8,15+tb);g.bezierCurveTo(25,10+tb,25,-25+tb,20,-25+tb);g.closePath();
      var tg=g.createLinearGradient(-20,-25,20,15);tg.addColorStop(0,'#ffd700');tg.addColorStop(1,'#daa520');g.fillStyle=tg;g.fill();
      // 받침
      g.fillRect(-12,15+tb,24,5);g.fillRect(-18,20+tb,36,5);
      // 별
      g.fillStyle='rgba(184,134,11,0.5)';g.font='bold 16px sans-serif';g.textAlign='center';g.textBaseline='middle';g.fillText('*',0,-5+tb);
      g.restore();
      _glow(g,mx,my,'rgba(255,215,0,0.1)');
      break;

    case 'chart-up':
      g.save();g.translate(mx,my);
      // 축
      g.beginPath();g.moveTo(-35,30);g.lineTo(-35,-30);g.strokeStyle='rgba(255,255,255,0.3)';g.lineWidth=2;g.stroke();
      g.beginPath();g.moveTo(-35,30);g.lineTo(35,30);g.stroke();
      // 바
      var bars=[15,25,20,35,30,40];
      bars.forEach(function(h,i){
        var x=-28+i*12;var bh=h*(0.5+Math.sin(t+i)*0.3);
        var bg=g.createLinearGradient(x,30-bh,x,30);bg.addColorStop(0,'#22c55e');bg.addColorStop(1,'#15803d');
        g.fillStyle=bg;g.fillRect(x,30-bh,8,bh);
      });
      // 상승 화살표
      g.beginPath();g.moveTo(25,-20);g.lineTo(35,-30);g.lineTo(35,-20);g.strokeStyle='#22c55e';g.lineWidth=2;g.stroke();
      g.restore();
      break;

    case 'safe':
      g.save();g.translate(mx,my);
      g.fillStyle='#374151';g.fillRect(-30,-30,60,60);g.strokeStyle='#555';g.lineWidth=3;g.strokeRect(-30,-30,60,60);
      // 다이얼
      g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.strokeStyle='#888';g.lineWidth=2;g.stroke();
      g.beginPath();g.moveTo(0,0);g.lineTo(12*Math.cos(t*2),12*Math.sin(t*2));g.strokeStyle='#ccc';g.lineWidth=2;g.stroke();
      // 핸들
      g.fillStyle='#666';g.fillRect(20,-5,8,10);
      g.restore();
      break;

    case 'key':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t)*0.15);
      // 머리
      g.beginPath();g.arc(-15,0,15,0,Math.PI*2);g.strokeStyle='#fbbf24';g.lineWidth=4;g.stroke();
      // 몸통
      g.beginPath();g.moveTo(0,0);g.lineTo(30,0);g.strokeStyle='#fbbf24';g.lineWidth=4;g.stroke();
      // 이
      g.beginPath();g.moveTo(25,0);g.lineTo(25,8);g.moveTo(30,0);g.lineTo(30,6);g.stroke();
      g.restore();
      _glow(g,mx,my,'rgba(251,191,36,0.1)');
      break;

    case 'magnet':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t*0.8)*0.1);
      g.beginPath();g.arc(0,-10,25,Math.PI,0);g.strokeStyle='#ef4444';g.lineWidth=10;g.stroke();
      g.fillStyle='#888';g.fillRect(-30,-10,10,25);g.fillRect(20,-10,10,25);
      // 파티클 당겨지는 효과
      for(var mi=0;mi<4;mi++){
        var ma=t*2+mi*1.5;var mr=40-((ma%3)*10);
        g.beginPath();g.arc(Math.cos(ma)*mr*0.3,15+Math.sin(ma)*5,2,0,Math.PI*2);
        g.fillStyle='rgba(239,68,68,'+(0.2+Math.sin(ma)*0.2)+')';g.fill();
      }
      g.restore();
      break;

    case 'target':
      g.save();g.translate(mx,my);
      [35,25,15].forEach(function(r,i){
        g.beginPath();g.arc(0,0,r,0,Math.PI*2);g.strokeStyle=i%2===0?'#ef4444':'#fff';g.lineWidth=3;g.stroke();
      });
      g.beginPath();g.arc(0,0,5,0,Math.PI*2);g.fillStyle='#ef4444';g.fill();
      // 회전하는 조준선
      g.beginPath();g.moveTo(40*Math.cos(t),40*Math.sin(t));g.lineTo(-40*Math.cos(t),-40*Math.sin(t));g.strokeStyle='rgba(255,255,255,0.2)';g.lineWidth=1;g.stroke();
      g.restore();
      break;

    case 'hourglass':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t*0.5)*0.05);
      g.beginPath();g.moveTo(-20,-35);g.lineTo(20,-35);g.lineTo(5,0);g.lineTo(20,35);g.lineTo(-20,35);g.lineTo(-5,0);g.closePath();
      g.strokeStyle='#a78bfa';g.lineWidth=2.5;g.stroke();
      // 모래
      var sand=((t*0.3)%1);
      g.fillStyle='rgba(167,139,250,0.4)';
      g.fillRect(-15,35-sand*30,30,sand*30);
      // 떨어지는 모래
      g.beginPath();g.arc(0,sand*30-15,1.5,0,Math.PI*2);g.fillStyle='#a78bfa';g.fill();
      g.restore();
      break;

    case 'flame':
      g.save();g.translate(mx,my);
      for(var fi=0;fi<3;fi++){
        var fo=fi*0.8+t*3;var fr=25-fi*5;
        g.beginPath();g.moveTo(0,30);
        g.bezierCurveTo(-fr,10+Math.sin(fo)*5,-fr,-20+Math.sin(fo+1)*5,0,-35+fi*8+Math.sin(fo)*3);
        g.bezierCurveTo(fr,-20+Math.sin(fo+2)*5,fr,10+Math.sin(fo+1)*5,0,30);
        g.fillStyle=['rgba(255,100,0,0.6)','rgba(255,180,0,0.5)','rgba(255,230,0,0.4)'][fi];g.fill();
      }
      g.restore();
      _glow(g,mx,my,'rgba(255,150,0,0.12)');
      break;

    case 'shield':
      g.save();g.translate(mx,my);
      var ss=1+Math.sin(t*2)*0.03;g.scale(ss,ss);
      g.beginPath();g.moveTo(0,-35);g.bezierCurveTo(-35,-25,-30,15,0,40);g.bezierCurveTo(30,15,35,-25,0,-35);
      var shg=g.createLinearGradient(-30,-35,30,40);shg.addColorStop(0,'#3b82f6');shg.addColorStop(1,'#1d4ed8');g.fillStyle=shg;g.fill();
      g.strokeStyle='rgba(255,255,255,0.3)';g.lineWidth=2;g.stroke();
      // 체크마크
      g.beginPath();g.moveTo(-10,5);g.lineTo(-3,12);g.lineTo(12,-8);g.strokeStyle='#fff';g.lineWidth=3;g.stroke();
      g.restore();
      break;

    case 'arrow-up':
      g.save();g.translate(mx,my);
      var ab=Math.sin(t*2)*5;
      g.beginPath();g.moveTo(0,-35+ab);g.lineTo(-20,-5+ab);g.lineTo(-8,-5+ab);g.lineTo(-8,35+ab);g.lineTo(8,35+ab);g.lineTo(8,-5+ab);g.lineTo(20,-5+ab);g.closePath();
      var ag=g.createLinearGradient(0,-35,0,35);ag.addColorStop(0,'#22c55e');ag.addColorStop(1,'#15803d');g.fillStyle=ag;g.fill();
      g.restore();
      _glow(g,mx,my,'rgba(34,197,94,0.1)');
      break;

    case 'atom':
      g.save();g.translate(mx,my);
      // 핵
      g.beginPath();g.arc(0,0,6,0,Math.PI*2);g.fillStyle='#8b5cf6';g.fill();
      // 궤도
      for(var ai=0;ai<3;ai++){
        g.save();g.rotate(t*0.3+ai*Math.PI/3);
        g.beginPath();g.ellipse(0,0,35,12,0,0,Math.PI*2);g.strokeStyle='rgba(139,92,246,0.4)';g.lineWidth=1.5;g.stroke();
        // 전자
        var ea=t*2+ai*2;
        g.beginPath();g.arc(35*Math.cos(ea),12*Math.sin(ea),3,0,Math.PI*2);g.fillStyle='#a78bfa';g.fill();
        g.restore();
      }
      g.restore();
      break;

    case 'infinity':
      g.save();g.translate(mx,my);g.rotate(Math.sin(t*0.3)*0.05);
      g.beginPath();
      for(var it=0;it<Math.PI*2;it+=0.05){
        var ix=35*Math.cos(it)/(1+Math.sin(it)*Math.sin(it));
        var iy=35*Math.sin(it)*Math.cos(it)/(1+Math.sin(it)*Math.sin(it));
        it===0?g.moveTo(ix,iy):g.lineTo(ix,iy);
      }
      g.strokeStyle='#a78bfa';g.lineWidth=4;g.stroke();
      // 빛나는 점
      var ipt=t*1.5;
      var ipx=35*Math.cos(ipt)/(1+Math.sin(ipt)*Math.sin(ipt));
      var ipy=35*Math.sin(ipt)*Math.cos(ipt)/(1+Math.sin(ipt)*Math.sin(ipt));
      g.beginPath();g.arc(ipx,ipy,4,0,Math.PI*2);g.fillStyle='#fff';g.fill();
      g.restore();
      break;

    case 'dollar':
      g.save();g.translate(mx,my);
      var dr=Math.sin(t*1.5)*0.05;g.rotate(dr);
      g.font='bold 60px sans-serif';g.textAlign='center';g.textBaseline='middle';
      g.fillStyle='#22c55e';g.globalAlpha=0.8+Math.sin(t*2)*0.2;g.fillText('$',0,4);
      g.globalAlpha=1;
      g.restore();
      _glow(g,mx,my,'rgba(34,197,94,0.12)');
      break;

    case 'eye':
      g.save();g.translate(mx,my);
      // 눈 외곽
      g.beginPath();g.moveTo(-35,0);g.bezierCurveTo(-20,-25,20,-25,35,0);g.bezierCurveTo(20,25,-20,25,-35,0);
      g.fillStyle='rgba(255,255,255,0.1)';g.fill();g.strokeStyle='#8b5cf6';g.lineWidth=2;g.stroke();
      // 홍채
      g.beginPath();g.arc(0,0,15,0,Math.PI*2);g.fillStyle='#8b5cf6';g.fill();
      // 동공
      var ps=5+Math.sin(t*2)*2;
      g.beginPath();g.arc(0,0,ps,0,Math.PI*2);g.fillStyle='#1a1a2e';g.fill();
      // 반사
      g.beginPath();g.arc(-4,-4,3,0,Math.PI*2);g.fillStyle='rgba(255,255,255,0.6)';g.fill();
      g.restore();
      break;

    case 'lock-open':
      g.save();g.translate(mx,my);
      // 몸통
      g.fillStyle='#f59e0b';g.fillRect(-18,0,36,30);g.strokeStyle='#d97706';g.lineWidth=2;g.strokeRect(-18,0,36,30);
      // 고리 (열린)
      g.beginPath();g.arc(0,-5,14,Math.PI,0);g.strokeStyle='#d97706';g.lineWidth=4;g.stroke();
      // 열쇠구멍
      g.beginPath();g.arc(0,12,5,0,Math.PI*2);g.fillStyle='#92400e';g.fill();
      g.fillRect(-2,15,4,8);
      g.restore();
      break;

    case 'mountain':
      g.save();g.translate(mx,my);
      // 산
      g.beginPath();g.moveTo(-40,30);g.lineTo(-5,-35);g.lineTo(10,-15);g.lineTo(30,-30);g.lineTo(40,30);g.closePath();
      var mg=g.createLinearGradient(0,-35,0,30);mg.addColorStop(0,'#8b5cf6');mg.addColorStop(1,'#4c1d95');g.fillStyle=mg;g.fill();
      // 눈
      g.beginPath();g.moveTo(-5,-35);g.lineTo(-12,-20);g.lineTo(2,-20);g.closePath();g.fillStyle='rgba(255,255,255,0.5)';g.fill();
      // 깃발
      var ff=Math.sin(t*2)*3;
      g.beginPath();g.moveTo(-5,-35);g.lineTo(-5,-50);g.strokeStyle='#ef4444';g.lineWidth=2;g.stroke();
      g.beginPath();g.moveTo(-5,-50);g.lineTo(5,-47+ff);g.lineTo(-5,-44);g.fillStyle='#ef4444';g.fill();
      g.restore();
      break;

    case 'sun':
      g.save();g.translate(mx,my);
      // 광선
      for(var si=0;si<8;si++){
        var sa=t*0.5+si*Math.PI/4;
        g.beginPath();g.moveTo(Math.cos(sa)*25,Math.sin(sa)*25);g.lineTo(Math.cos(sa)*38,Math.sin(sa)*38);
        g.strokeStyle='rgba(251,191,36,'+(0.3+Math.sin(t*2+si)*0.2)+')';g.lineWidth=3;g.stroke();
      }
      // 원
      g.beginPath();g.arc(0,0,20,0,Math.PI*2);
      var sug=g.createRadialGradient(0,0,5,0,0,20);sug.addColorStop(0,'#fde68a');sug.addColorStop(1,'#f59e0b');g.fillStyle=sug;g.fill();
      g.restore();
      break;

    case 'gear':
      g.save();g.translate(mx,my);g.rotate(t*0.5);
      // 톱니
      for(var gi=0;gi<8;gi++){
        var ga=gi*Math.PI/4;
        g.save();g.rotate(ga);g.fillStyle='#64748b';g.fillRect(-5,-35,10,12);g.restore();
      }
      g.beginPath();g.arc(0,0,25,0,Math.PI*2);g.fillStyle='#475569';g.fill();
      g.beginPath();g.arc(0,0,10,0,Math.PI*2);g.fillStyle='#1e293b';g.fill();
      g.restore();
      break;

    case 'bulb':
      g.save();g.translate(mx,my);
      var bo=0.6+Math.sin(t*2)*0.3;
      g.globalAlpha=bo;
      // 빛
      g.beginPath();g.arc(0,-10,30,0,Math.PI*2);
      var blg=g.createRadialGradient(0,-10,5,0,-10,30);blg.addColorStop(0,'rgba(251,191,36,0.3)');blg.addColorStop(1,'rgba(251,191,36,0)');g.fillStyle=blg;g.fill();
      g.globalAlpha=1;
      // 전구
      g.beginPath();g.arc(0,-10,20,Math.PI*0.8,Math.PI*0.2);
      g.lineTo(8,18);g.lineTo(-8,18);g.closePath();
      g.fillStyle='#fbbf24';g.fill();
      // 나사
      g.fillStyle='#888';g.fillRect(-8,18,16,4);g.fillRect(-6,23,12,4);
      g.restore();
      break;

    case 'graph':
      g.save();g.translate(mx,my);
      // 선 그래프
      g.beginPath();g.moveTo(-35,20);
      var pts=[[-25,10],[-15,15],[-5,-5],[5,-15],[15,-10],[25,-25],[35,-30]];
      pts.forEach(function(p){g.lineTo(p[0],p[1]+Math.sin(t+p[0]*0.1)*5);});
      g.strokeStyle='#22c55e';g.lineWidth=3;g.stroke();
      // 점
      pts.forEach(function(p){g.beginPath();g.arc(p[0],p[1]+Math.sin(t+p[0]*0.1)*5,3,0,Math.PI*2);g.fillStyle='#22c55e';g.fill();});
      g.restore();
      break;

    case 'wave':
      g.save();g.translate(mx,my);
      for(var wi=0;wi<3;wi++){
        g.beginPath();
        for(var wx=-40;wx<=40;wx++){
          var wy=Math.sin(wx*0.15+t*2+wi)*12*(1-wi*0.2);
          wx===-40?g.moveTo(wx,wy+wi*8-8):g.lineTo(wx,wy+wi*8-8);
        }
        g.strokeStyle='rgba(6,182,212,'+(0.5-wi*0.15)+')';g.lineWidth=3-wi*0.5;g.stroke();
      }
      g.restore();
      break;

    case 'hexagon':
      g.save();g.translate(mx,my);g.rotate(t*0.2);
      var hs=1+Math.sin(t*1.5)*0.05;g.scale(hs,hs);
      g.beginPath();
      for(var hi=0;hi<6;hi++){var ha=hi*Math.PI/3-Math.PI/6;g.lineTo(35*Math.cos(ha),35*Math.sin(ha));}
      g.closePath();
      var hg=g.createLinearGradient(-35,-35,35,35);hg.addColorStop(0,'#8b5cf6');hg.addColorStop(1,'#06b6d4');g.fillStyle=hg;g.fill();
      g.strokeStyle='rgba(255,255,255,0.2)';g.lineWidth=2;g.stroke();
      // 내부 헥사곤
      g.beginPath();
      for(hi=0;hi<6;hi++){ha=hi*Math.PI/3-Math.PI/6;g.lineTo(20*Math.cos(ha),20*Math.sin(ha));}
      g.closePath();g.strokeStyle='rgba(255,255,255,0.15)';g.stroke();
      g.restore();
      break;

    default:
      // 기본: 회전하는 원
      g.save();g.translate(mx,my);
      g.beginPath();g.arc(0,0,30,0,Math.PI*2);g.strokeStyle='#8b5cf6';g.lineWidth=3;g.stroke();
      g.beginPath();g.arc(30*Math.cos(t),30*Math.sin(t),5,0,Math.PI*2);g.fillStyle='#a78bfa';g.fill();
      g.restore();
  }
}

// 글로우 헬퍼
function _glow(g,mx,my,color){
  var gg=g.createRadialGradient(mx,my,20,mx,my,65);gg.addColorStop(0,color);gg.addColorStop(1,'rgba(0,0,0,0)');g.fillStyle=gg;g.fillRect(0,0,mx*2,my*2);
}

// 별 그리기 헬퍼
function _drawStar(g,cx,cy,spikes,outerR,innerR){
  var rot=Math.PI/2*3,step=Math.PI/spikes;
  g.beginPath();g.moveTo(cx,cy-outerR);
  for(var si=0;si<spikes;si++){
    g.lineTo(cx+Math.cos(rot)*outerR,cy+Math.sin(rot)*outerR);rot+=step;
    g.lineTo(cx+Math.cos(rot)*innerR,cy+Math.sin(rot)*innerR);rot+=step;
  }
  g.lineTo(cx,cy-outerR);g.closePath();
}
