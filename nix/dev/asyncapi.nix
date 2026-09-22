{ pkgs, nodejs }:

let
  cliVersion = "6.0.2";

  asyncapi = pkgs.writeShellScriptBin "asyncapi" ''
    exec ${nodejs}/bin/npm exec \
      --yes \
      --package=@asyncapi/cli@${cliVersion} \
      -- asyncapi "$@"
  '';

  studio = pkgs.writeShellScriptBin "asyncapi-studio" ''
    exec ${asyncapi}/bin/asyncapi start studio "$@"
  '';

  preview = pkgs.writeShellScriptBin "asyncapi-preview" ''
    exec ${asyncapi}/bin/asyncapi start preview "$@"
  '';

  docs = pkgs.writeShellScriptBin "asyncapi-docs" ''
    if [ "$#" -lt 1 ]; then
      echo "Usage: asyncapi-docs <asyncapi.yaml> [output-dir]" >&2
      exit 1
    fi

    spec="$1"
    output="''${2:-./build/asyncapi-docs}"

    exec ${asyncapi}/bin/asyncapi generate fromTemplate \
      "$spec" \
      @asyncapi/html-template@3.5.0 \
      --param singleFile=true outFilename=asyncapi.html \
      --output "$output" \
      --force-write
  '';
in
  [ asyncapi studio preview docs ]
