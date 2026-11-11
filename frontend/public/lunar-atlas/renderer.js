const vertex = `#version 300 es
in vec2 position;
void main(){ gl_Position=vec4(position,0.,1.); }`;

const fragment = `#version 300 es
precision highp float;
uniform vec2 size;
uniform float radius, relief, night, flatMode;
uniform mat3 basis;
uniform vec2 center;
uniform vec3 sun;
uniform sampler2D surface, elevation;
out vec4 pixel;
const float PI = 3.14159265359;
vec2 uvFor(vec3 p) {
  return vec2(fract(atan(p.x,p.z)/(2.*PI)+.5), .5-asin(clamp(p.y,-1.,1.))/PI);
}
vec3 point(float lat,float lon) {
  return vec3(sin(lon)*cos(lat), sin(lat),cos(lon)*cos(lat));
}
float heightAt(vec2 uv) {
  return texture(elevation,vec2(fract(uv.x),clamp(uv.y,0.,1.))).r;
}
void main() {
  vec2 q=(gl_FragCoord.xy-size*.5)/radius;
  vec3 p;
  float facing=1.;
  if(flatMode>.5){
    float lat=center.x+q.y;
    if(abs(lat)>PI*.5) discard;
    p=point(lat,center.y+q.x);
  } else {
    float r2=dot(q,q);
    if(r2>1.) discard;
    facing=sqrt(1.-r2);
    p=basis*vec3(q,facing);
  }
  vec2 uv=uvFor(p);
  vec2 dx=vec2(1./1440.,0.), dy=vec2(0.,1./720.);
  vec3 east=normalize(vec3(p.z+.000001,0.,-p.x));
  vec3 north=cross(p,east);
  float de=(heightAt(uv+dx)-heightAt(uv-dx))/max(4.,15.16*length(p.xz));
  float dn=(heightAt(uv-dy)-heightAt(uv+dy))/15.16;
  vec3 normal=normalize(p-relief*(east*de+north*dn));
  float terrain=clamp(dot(normal-p,normalize(east*.7+north)), -.8,.8);
  float light=night>.5 ? .12+.88*pow(max(dot(normal,sun),0.),.58) : (.78+.22*facing)+terrain*.38;
  vec3 color=texture(surface,uv).rgb;
  pixel=vec4(color*light,1.);
}`;

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', {alpha:true, antialias:false});
  if (!gl) return null;
  const program = gl.createProgram();
  for (const [kind, source] of [[gl.VERTEX_SHADER,vertex],[gl.FRAGMENT_SHADER,fragment]]) {
    const shader = gl.createShader(kind);
    gl.shaderSource(shader,source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program,shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
  gl.useProgram(program);
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER,quad);
  gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program,'position');
  gl.enableVertexAttribArray(position);
  gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
  const uniform = Object.fromEntries(['size','radius','relief','night','flatMode','basis','center','sun','surface','elevation']
    .map(name=>[name,gl.getUniformLocation(program,name)]));
  function texture(unit,name,filter) {
    gl.activeTexture(gl.TEXTURE0+unit);
    gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,filter);
    gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,filter);
    gl.uniform1i(uniform[name],unit);
  }
  texture(0,'surface',gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array([105,106,110,255]));
  texture(1,'elevation',gl.NEAREST);
  gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,1,1,0,gl.RED,gl.FLOAT,new Float32Array([0]));
  return {
    setImage(image) {
      gl.activeTexture(gl.TEXTURE0);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,image);
    },
    setElevation(samples) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texImage2D(gl.TEXTURE_2D,0,gl.R32F,1440,720,0,gl.RED,gl.FLOAT,Float32Array.from(samples,value=>value/1000));
    },
    render({radius,dpr,basis,center,relief,night,flat,sun}) {
      gl.viewport(0,0,canvas.width,canvas.height);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.uniform2f(uniform.size,canvas.width,canvas.height);
      gl.uniform1f(uniform.radius,radius*dpr);
      gl.uniform1f(uniform.relief,relief);
      gl.uniform1f(uniform.night,Number(night));
      gl.uniform1f(uniform.flatMode,Number(flat));
      gl.uniformMatrix3fv(uniform.basis,false,basis);
      gl.uniform2fv(uniform.center,center);
      gl.uniform3fv(uniform.sun,sun);
      gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    }
  };
}
